import type { LoginResult, ParsedLoginEvent } from "../types";

/*
 * Turns one sshd / sshd-session log message (OpenSSH 8.9 on 22.04, 9.6 on 24.04, 9.9+ on 25.x)
 * into a login event. The input is normally the journal MESSAGE field; an /var/log/auth.log line
 * with its syslog prefix (`Oct 18 14:02:11 host sshd[1234]: …` or the RFC 3339 form) and an
 * rsyslog `message repeated N times: [ … ]` wrapper are also accepted.
 *
 * Counting rules, chosen so one attempt is not recorded twice:
 * - `Accepted <method> for …` is a success.
 * - `Failed <method> for invalid user …` and `Invalid user … from …` are both `invalid_user`. sshd
 *   logs the second when it looks the name up and the first for every password tried, so a
 *   password guess against a missing user yields two events. That is accepted on purpose: on
 *   key-only servers the `Invalid user` line is the only trace of the attempt.
 * - `Failed <method> for <user> …` is a failure.
 * - `Connection closed by authenticating user …` is a failure: on key-only servers it is the only
 *   line a rejected attempt against a real user produces.
 * - `Disconnected from invalid user`, `Connection closed by invalid user`, `Disconnected from
 *   authenticating user` and `maximum authentication attempts exceeded` return null: each always
 *   follows a line already counted above for the same connection.
 */

const SYSLOG_PREFIX = /^.*?\bsshd(?:-session)?\[\d+\]:\s+/;
const REPEATED_MESSAGE = /^message repeated \d+ times: \[\s*(.*?)\s*\]$/;

const ACCEPTED = /^Accepted (\S+) for (.+?) from (\S+) port (\d+)/;
const FAILED_INVALID_USER = /^Failed (\S+) for invalid user (.*?) from (\S+) port (\d+)/;
const FAILED = /^Failed (\S+) for (.+?) from (\S+) port (\d+)/;
const INVALID_USER = /^Invalid user (.*?) from (\S+)(?: port (\d+))?/;
const CLOSED_AUTHENTICATING = /^Connection closed by authenticating user (.+?) (\S+) port (\d+)/;

interface LinePattern {
  pattern: RegExp;
  result: LoginResult;
  build: (match: RegExpExecArray) => { method: string; username: string; address: string; port: string | undefined };
}

const LINE_PATTERNS: LinePattern[] = [
  {
    pattern: ACCEPTED,
    result: "success",
    build: (match) => ({ method: match[1] ?? "", username: match[2] ?? "", address: match[3] ?? "", port: match[4] }),
  },
  {
    pattern: FAILED_INVALID_USER,
    result: "invalid_user",
    build: (match) => ({ method: match[1] ?? "", username: match[2] ?? "", address: match[3] ?? "", port: match[4] }),
  },
  {
    pattern: FAILED,
    result: "failure",
    build: (match) => ({ method: match[1] ?? "", username: match[2] ?? "", address: match[3] ?? "", port: match[4] }),
  },
  {
    pattern: INVALID_USER,
    result: "invalid_user",
    build: (match) => ({ method: "none", username: match[1] ?? "", address: match[2] ?? "", port: match[3] }),
  },
  {
    pattern: CLOSED_AUTHENTICATING,
    result: "failure",
    build: (match) => ({ method: "none", username: match[1] ?? "", address: match[2] ?? "", port: match[3] }),
  },
];

function unwrapMessage(message: string): string {
  const withoutPrefix = message.trim().replace(SYSLOG_PREFIX, "");
  return REPEATED_MESSAGE.exec(withoutPrefix)?.[1] ?? withoutPrefix;
}

export function parseSshdLine(message: string, timestamp: number): ParsedLoginEvent | null {
  const body = unwrapMessage(message);
  for (const { pattern, result, build } of LINE_PATTERNS) {
    const match = pattern.exec(body);
    if (!match) {
      continue;
    }
    const { method, username, address, port } = build(match);
    const sourcePort = port === undefined ? null : Number(port);
    return {
      timestamp,
      channel: "ssh",
      username,
      result,
      method,
      sourceAddress: address || null,
      sourcePort: Number.isInteger(sourcePort) ? sourcePort : null,
      raw: message,
    };
  }
  return null;
}
