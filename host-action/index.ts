import { execFile } from "node:child_process";
import fileSystem from "node:fs";
import { PROGRAM_NOT_FOUND_OUTPUT, type ProgramRunner } from "@/host-action/execute-host-action";
import { processInbox } from "@/host-action/process-inbox";

/*
 * ServerLab host-action helper. Runs as root from serverlab-host-action.service, which only the
 * serverlab user may start (deploy/polkit/61-serverlab-host-action.rules). It reads requests the
 * collector queued, runs the matching ufw / fail2ban-client commands without a shell, writes the
 * results and exits. install.sh copies the bundled file to /usr/local/libexec/serverlab/, owned by
 * root, so the serverlab user cannot change the code that runs as root.
 */

const EXCHANGE_DIRECTORY = "/run/serverlab-host-action";
const SERVICE_USER = "serverlab";
const COMMAND_TIMEOUT_MILLISECONDS = 60_000;
const SAFE_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function readUserId(userName: string): number {
  const passwordEntry = fileSystem
    .readFileSync("/etc/passwd", "utf8")
    .split("\n")
    .map((line) => line.split(":"))
    .find((fields) => fields[0] === userName);
  const userId = passwordEntry ? Number(passwordEntry[2]) : Number.NaN;
  if (!Number.isInteger(userId) || userId <= 0) throw new Error(`user ${userName} not found`);
  return userId;
}

const runProgram: ProgramRunner = (command) =>
  new Promise((resolve) => {
    execFile(command.program, command.commandArguments, { timeout: COMMAND_TIMEOUT_MILLISECONDS, maxBuffer: 4 * 1024 * 1024, env: { PATH: SAFE_PATH, LC_ALL: "C", NODE_ENV: "production" } }, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") return resolve({ exitCode: null, output: PROGRAM_NOT_FOUND_OUTPUT });
      const exitCode = error ? (typeof error.code === "number" ? error.code : null) : 0;
      resolve({ exitCode, output: [stdout, stderr].filter(Boolean).join("\n") });
    });
  });

async function main() {
  if (process.getuid?.() !== 0) throw new Error("must run as root (it is started by serverlab-host-action.service)");
  const handledCount = await processInbox({
    inboxDirectory: `${EXCHANGE_DIRECTORY}/inbox`,
    outboxDirectory: `${EXCHANGE_DIRECTORY}/outbox`,
    requesterUserId: readUserId(SERVICE_USER),
    directoryOwnerId: 0,
    runProgram,
    now: () => Date.now(),
    log: (message) => console.log(`[host-action] ${message}`),
  });
  if (handledCount === 0) console.log("[host-action] nothing to do");
}

main().catch((error: unknown) => {
  console.error("[host-action]", error instanceof Error ? error.message : error);
  process.exit(1);
});
