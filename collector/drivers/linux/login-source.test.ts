import { describe, expect, test } from "vitest";
import { parseJournalEntry } from "./login-source";

const ACCEPTED_MESSAGE = "Accepted publickey for operator from 100.64.0.7 port 52144 ssh2: ED25519 SHA256:abc";

describe("parseJournalEntry", () => {
  test("accepts sshd entries logged by root", () => {
    const entry = { MESSAGE: ACCEPTED_MESSAGE, SYSLOG_IDENTIFIER: "sshd-session", _UID: "0", __REALTIME_TIMESTAMP: "1792915260000000" };
    expect(parseJournalEntry(entry)).toMatchObject({ username: "operator", result: "success", sourceAddress: "100.64.0.7", timestamp: 1_792_915_260_000 });
  });

  test("rejects entries any local user can forge with `logger -t sshd`", () => {
    expect(parseJournalEntry({ MESSAGE: "Accepted password for root from 203.0.113.9 port 22 ssh2", SYSLOG_IDENTIFIER: "sshd", _UID: "1000" })).toBeNull();
    expect(parseJournalEntry({ MESSAGE: "Accepted password for root from 203.0.113.9 port 22 ssh2", SYSLOG_IDENTIFIER: "sshd" })).toBeNull();
    expect(parseJournalEntry({ MESSAGE: "FAILED LOGIN (1) on '/dev/tty1' FOR 'root', Authentication failure", SYSLOG_IDENTIFIER: "login", _UID: "1000" })).toBeNull();
  });

  test("decodes binary messages", () => {
    const entry = { MESSAGE: [...Buffer.from(ACCEPTED_MESSAGE)], SYSLOG_IDENTIFIER: "sshd", _UID: "0" };
    expect(parseJournalEntry(entry)?.username).toBe("operator");
  });
});
