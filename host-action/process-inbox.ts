import { randomBytes } from "node:crypto";
import fileSystem from "node:fs";
import path from "node:path";
import { executeHostAction, type ProgramRunner } from "@/host-action/execute-host-action";
import type { HostActionResult } from "@/lib/security/security-types";
import { hostActionRequestSchema } from "@/lib/security/security-validation";

/*
 * The root side of the host-action exchange. Directory layout (deploy/serverlab-host-action.tmpfiles):
 *
 *   /run/serverlab-host-action/          root:root       0755
 *   /run/serverlab-host-action/inbox/    root:serverlab  1770  the collector drops <id>.json here
 *   /run/serverlab-host-action/outbox/   root:serverlab  0750  results, readable by the collector
 *
 * Everything in the inbox is treated as hostile: the file must be a regular file (not a symlink)
 * owned by the serverlab user and small, and its JSON must pass the same schema the web app uses.
 * Results are written to a fresh temporary file and renamed into place, in a directory serverlab
 * cannot write to.
 */

export interface InboxEnvironment {
  inboxDirectory: string;
  outboxDirectory: string;
  requesterUserId: number;
  /** 0 (root) in production; tests pass their own user id. */
  directoryOwnerId: number;
  runProgram: ProgramRunner;
  now: () => number;
  log: (message: string) => void;
}

const MAXIMUM_REQUEST_BYTES = 16 * 1024;
const OUTBOX_RETENTION_MILLISECONDS = 15 * 60_000;
const REQUEST_FILE_PATTERN = /^[A-Za-z0-9-]{8,64}\.json$/;

/** Fails unless `directoryPath` is a real directory (not a symlink) owned by `ownerId` (root in production). */
export function assertOwnedDirectory(directoryPath: string, ownerId: number): void {
  const status = fileSystem.lstatSync(directoryPath);
  if (!status.isDirectory() || status.isSymbolicLink()) throw new Error(`${directoryPath} is not a directory`);
  if (status.uid !== ownerId) throw new Error(`${directoryPath} must be owned by uid ${ownerId}`);
}

const modifiedTime = (filePath: string) => {
  try {
    return fileSystem.lstatSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
};

const removeQuietly = (filePath: string) => {
  try {
    fileSystem.rmSync(filePath, { force: true });
  } catch {
    /* A directory or something already gone: leave it, it is never read. */
  }
};

/** Reads one request file safely, deletes it, and returns its text, or null when it must be ignored. */
export function readRequestFile(filePath: string, requesterUserId: number): string | null {
  let fileDescriptor: number | null = null;
  try {
    fileDescriptor = fileSystem.openSync(filePath, fileSystem.constants.O_RDONLY | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_NONBLOCK);
    const status = fileSystem.fstatSync(fileDescriptor);
    if (!status.isFile() || status.uid !== requesterUserId || status.size > MAXIMUM_REQUEST_BYTES) return null;
    const buffer = Buffer.alloc(status.size);
    fileSystem.readSync(fileDescriptor, buffer, 0, status.size, 0);
    return buffer.toString("utf8");
  } catch {
    return null;
  } finally {
    if (fileDescriptor !== null) fileSystem.closeSync(fileDescriptor);
    removeQuietly(filePath);
  }
}

/** Writes `result` as outbox/<requestId>.json without following or overwriting anything. */
export function writeResultFile(outboxDirectory: string, result: HostActionResult): void {
  const temporaryPath = path.join(outboxDirectory, `.${result.requestId}.${randomBytes(6).toString("hex")}.tmp`);
  fileSystem.writeFileSync(temporaryPath, JSON.stringify(result), { flag: "wx", mode: 0o640 });
  fileSystem.renameSync(temporaryPath, path.join(outboxDirectory, `${result.requestId}.json`));
}

function pruneOutbox(outboxDirectory: string, now: number): void {
  for (const fileName of fileSystem.readdirSync(outboxDirectory)) {
    const filePath = path.join(outboxDirectory, fileName);
    if (now - modifiedTime(filePath) > OUTBOX_RETENTION_MILLISECONDS) removeQuietly(filePath);
  }
}

/**
 * Handles every request waiting in the inbox, oldest first. Returns how many were carried out.
 */
export async function processInbox(environment: InboxEnvironment): Promise<number> {
  assertOwnedDirectory(environment.inboxDirectory, environment.directoryOwnerId);
  assertOwnedDirectory(environment.outboxDirectory, environment.directoryOwnerId);
  pruneOutbox(environment.outboxDirectory, environment.now());
  const requestFiles = fileSystem
    .readdirSync(environment.inboxDirectory)
    .map((fileName) => ({ fileName, filePath: path.join(environment.inboxDirectory, fileName) }))
    .sort((first, second) => modifiedTime(first.filePath) - modifiedTime(second.filePath));
  let handledCount = 0;
  for (const { fileName, filePath } of requestFiles) {
    if (!REQUEST_FILE_PATTERN.test(fileName)) {
      environment.log(`ignored ${JSON.stringify(fileName)}: not a request file name`);
      removeQuietly(filePath);
      continue;
    }
    const requestText = readRequestFile(filePath, environment.requesterUserId);
    if (requestText === null) {
      environment.log(`ignored ${fileName}: not a regular file owned by the serverlab user, or too large`);
      continue;
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(requestText);
    } catch {
      environment.log(`ignored ${fileName}: not JSON`);
      continue;
    }
    const parsedRequest = hostActionRequestSchema.safeParse(parsedJson);
    if (!parsedRequest.success || `${parsedRequest.data.requestId}.json` !== fileName) {
      environment.log(`refused ${fileName}: ${parsedRequest.success ? "file name does not match the request id" : parsedRequest.error.issues.map((issue) => issue.message).join("; ")}`);
      continue;
    }
    const { requestId, action } = parsedRequest.data;
    const executed = await executeHostAction(action, environment.runProgram);
    if (action.kind !== "snapshot") environment.log(`${requestId} ${action.kind}: ${executed.isSuccessful ? "ok" : (executed.errorMessage ?? "failed")}`);
    writeResultFile(environment.outboxDirectory, { requestId, ...executed, finishedAt: environment.now() });
    handledCount += 1;
  }
  return handledCount;
}
