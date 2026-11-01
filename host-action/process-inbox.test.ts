import fileSystem from "node:fs";
import operatingSystem from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { executeHostAction, PROGRAM_NOT_FOUND_OUTPUT, type ProgramRunner } from "@/host-action/execute-host-action";
import { processInbox, type InboxEnvironment } from "@/host-action/process-inbox";
import { readFixture } from "@/collector/parsers/read-fixture";
import type { HostCommand } from "@/lib/security/security-commands";
import type { HostActionResult } from "@/lib/security/security-types";

const currentUserId = process.getuid?.() ?? 1000;

function createRecordingRunner(outputs: Record<string, { exitCode: number | null; output: string }> = {}) {
  const ranCommands: string[] = [];
  const runProgram: ProgramRunner = async (command: HostCommand) => {
    const commandText = [command.program, ...command.commandArguments].join(" ");
    ranCommands.push(commandText);
    return outputs[commandText] ?? { exitCode: 0, output: "" };
  };
  return { ranCommands, runProgram };
}

describe("executeHostAction", () => {
  test("snapshot reads ufw and fail2ban, then each jail", async () => {
    const { ranCommands, runProgram } = createRecordingRunner({ "fail2ban-client status": { exitCode: 0, output: readFixture("fail2ban-client-status.txt") } });
    const executed = await executeHostAction({ kind: "snapshot" }, runProgram);
    expect(executed.isSuccessful).toBe(true);
    expect(ranCommands).toEqual([
      "ufw status verbose",
      "ufw status numbered",
      "ufw show added",
      "fail2ban-client version",
      "fail2ban-client status",
      "fail2ban-client status nginx-http-auth",
      "fail2ban-client get nginx-http-auth bantime",
      "fail2ban-client get nginx-http-auth findtime",
      "fail2ban-client get nginx-http-auth maxretry",
      "fail2ban-client status sshd",
      "fail2ban-client get sshd bantime",
      "fail2ban-client get sshd findtime",
      "fail2ban-client get sshd maxretry",
    ]);
  });

  test("a missing program is reported, not thrown", async () => {
    const { runProgram } = createRecordingRunner({ "fail2ban-client set sshd banip 203.0.113.7": { exitCode: null, output: PROGRAM_NOT_FOUND_OUTPUT } });
    const executed = await executeHostAction({ kind: "fail2ban-ban", jail: "sshd", address: "203.0.113.7" }, runProgram);
    expect(executed).toMatchObject({ isSuccessful: false, errorMessage: "sudo fail2ban-client set sshd banip 203.0.113.7 failed: fail2ban-client is not installed." });
  });

  test("delete checks that rule N is still the chosen rule", async () => {
    const { ranCommands, runProgram } = createRecordingRunner({ "ufw status numbered": { exitCode: 0, output: readFixture("ufw-status-numbered-active.txt") } });
    const stale = await executeHostAction({ kind: "firewall-delete-rule", ruleNumber: 3, expectedRuleText: "22/tcp ALLOW IN Anywhere" }, runProgram);
    expect(stale.isSuccessful).toBe(false);
    expect(stale.errorMessage).toMatch(/changed since the page loaded/);
    expect(ranCommands).toEqual(["ufw status numbered"]);

    const current = await executeHostAction({ kind: "firewall-delete-rule", ruleNumber: 3, expectedRuleText: "8443   DENY IN    192.168.1.0/24" }, runProgram);
    expect(current.isSuccessful).toBe(true);
    expect(ranCommands.at(-1)).toBe("ufw --force delete 3");
  });
});

describe("processInbox", () => {
  let rootDirectory: string;
  let environment: InboxEnvironment;
  let recorder: ReturnType<typeof createRecordingRunner>;
  const logLines: string[] = [];

  beforeEach(() => {
    rootDirectory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "serverlab-host-action-"));
    fileSystem.mkdirSync(path.join(rootDirectory, "inbox"));
    fileSystem.mkdirSync(path.join(rootDirectory, "outbox"));
    recorder = createRecordingRunner();
    logLines.length = 0;
    environment = {
      inboxDirectory: path.join(rootDirectory, "inbox"),
      outboxDirectory: path.join(rootDirectory, "outbox"),
      requesterUserId: currentUserId,
      directoryOwnerId: currentUserId,
      runProgram: recorder.runProgram,
      now: () => 1_793_000_000_000,
      log: (message) => logLines.push(message),
    };
  });
  afterEach(() => fileSystem.rmSync(rootDirectory, { recursive: true, force: true }));

  const queue = (fileName: string, content: unknown) => fileSystem.writeFileSync(path.join(environment.inboxDirectory, fileName), typeof content === "string" ? content : JSON.stringify(content));
  const readResult = (requestId: string) => JSON.parse(fileSystem.readFileSync(path.join(environment.outboxDirectory, `${requestId}.json`), "utf8")) as HostActionResult;

  test("runs a valid request, writes its result and empties the inbox", async () => {
    queue("request-0001.json", { requestId: "request-0001", action: { kind: "fail2ban-unban", jail: "sshd", address: "203.0.113.7" } });
    expect(await processInbox(environment)).toBe(1);
    expect(recorder.ranCommands).toEqual(["fail2ban-client set sshd unbanip 203.0.113.7"]);
    expect(readResult("request-0001")).toMatchObject({ requestId: "request-0001", isSuccessful: true, finishedAt: 1_793_000_000_000, steps: [{ commandLine: "sudo fail2ban-client set sshd unbanip 203.0.113.7", exitCode: 0 }] });
    expect(fileSystem.readdirSync(environment.inboxDirectory)).toEqual([]);
  });

  test.each([
    ["shell injection in an address", { requestId: "request-0002", action: { kind: "fail2ban-ban", jail: "sshd", address: "1.1.1.1; rm -rf /" } }],
    ["an unknown action", { requestId: "request-0002", action: { kind: "run", command: "reboot" } }],
    ["a request id that does not match the file name", { requestId: "request-9999", action: { kind: "snapshot" } }],
    ["not JSON", "{ not json"],
  ])("refuses %s", async (_description, content) => {
    queue("request-0002.json", content);
    expect(await processInbox(environment)).toBe(0);
    expect(recorder.ranCommands).toEqual([]);
    expect(fileSystem.readdirSync(environment.outboxDirectory)).toEqual([]);
    expect(fileSystem.readdirSync(environment.inboxDirectory)).toEqual([]);
  });

  test("ignores symlinks instead of reading through them", async () => {
    const targetPath = path.join(rootDirectory, "elsewhere.json");
    fileSystem.writeFileSync(targetPath, JSON.stringify({ requestId: "request-0003", action: { kind: "firewall-disable" } }));
    fileSystem.symlinkSync(targetPath, path.join(environment.inboxDirectory, "request-0003.json"));
    expect(await processInbox(environment)).toBe(0);
    expect(recorder.ranCommands).toEqual([]);
    expect(fileSystem.existsSync(targetPath)).toBe(true);
  });

  test("ignores files owned by another user", async () => {
    queue("request-0004.json", { requestId: "request-0004", action: { kind: "firewall-disable" } });
    expect(await processInbox({ ...environment, requesterUserId: currentUserId + 1 })).toBe(0);
    expect(recorder.ranCommands).toEqual([]);
  });

  test("ignores odd file names and directories", async () => {
    fileSystem.mkdirSync(path.join(environment.inboxDirectory, "nested"));
    queue("../escape", "x");
    queue(".hidden.json", { requestId: "request-0005", action: { kind: "snapshot" } });
    expect(await processInbox(environment)).toBe(0);
    expect(recorder.ranCommands).toEqual([]);
  });

  test("refuses an inbox that is a symlink", async () => {
    const realInbox = path.join(rootDirectory, "real-inbox");
    fileSystem.mkdirSync(realInbox);
    await expect(processInbox({ ...environment, inboxDirectory: (fileSystem.symlinkSync(realInbox, path.join(rootDirectory, "linked-inbox")), path.join(rootDirectory, "linked-inbox")) })).rejects.toThrow(/not a directory/);
  });

  test("refuses directories owned by someone else", async () => {
    await expect(processInbox({ ...environment, directoryOwnerId: currentUserId + 1 })).rejects.toThrow(/must be owned/);
  });
});
