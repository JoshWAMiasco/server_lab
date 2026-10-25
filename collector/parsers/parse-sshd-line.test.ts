import { describe, expect, test } from "vitest";
import type { ParsedLoginEvent } from "../types";
import { readFixture } from "./read-fixture";
import { parseSshdLine } from "./parse-sshd-line";

const TIMESTAMP = Date.UTC(2026, 9, 18, 14, 2, 11);

type Expected = Pick<ParsedLoginEvent, "username" | "result" | "method" | "sourceAddress" | "sourcePort"> | null;

/*
 * Journal MESSAGE fields as logged by OpenSSH 8.9p1 (Ubuntu 22.04), 9.6p1 (24.04) and 9.9p1+
 * (25.04/25.10, where per-connection messages come from sshd-session). The message text is the
 * same across releases; the differences are covered by unwrapping syslog prefixes further down.
 *
 * Double counting: "Invalid user X from …" and "Failed password for invalid user X from …" for the
 * same connection are both counted (two invalid_user events). That is deliberate: on key-only
 * servers the "Invalid user" line is the only trace. The follow-up "Disconnected from invalid
 * user", "Connection closed by invalid user", "Disconnected from authenticating user" and
 * "maximum authentication attempts exceeded" lines return null because a counted line always
 * precedes them on the same connection.
 */
const CASES: [string, string, Expected][] = [
  [
    "22.04 publickey",
    "Accepted publickey for joshua from 100.101.2.3 port 52144 ssh2: ED25519 SHA256:3k1bKq9nY2XcVd8rT0pLmZ4aB6fG7hJ8kL9mN0pQ1rS",
    { username: "joshua", result: "success", method: "publickey", sourceAddress: "100.101.2.3", sourcePort: 52_144 },
  ],
  [
    "22.04 RSA publickey",
    "Accepted publickey for deploy from 192.168.1.50 port 40022 ssh2: RSA SHA256:Zx8k2mQp4LrT6vWy0aBcDeFgHiJkLmNoPqRsTuVwXyZ",
    { username: "deploy", result: "success", method: "publickey", sourceAddress: "192.168.1.50", sourcePort: 40_022 },
  ],
  [
    "22.04 password",
    "Accepted password for joshua from 192.168.1.20 port 51514 ssh2",
    { username: "joshua", result: "success", method: "password", sourceAddress: "192.168.1.20", sourcePort: 51_514 },
  ],
  [
    "24.04 keyboard-interactive",
    "Accepted keyboard-interactive/pam for joshua from 10.0.0.12 port 60122 ssh2",
    { username: "joshua", result: "success", method: "keyboard-interactive/pam", sourceAddress: "10.0.0.12", sourcePort: 60_122 },
  ],
  [
    "24.04 IPv6 publickey",
    "Accepted publickey for joshua from fd7a:115c:a1e0::1a01:202 port 50322 ssh2: ED25519 SHA256:abcDEF123",
    { username: "joshua", result: "success", method: "publickey", sourceAddress: "fd7a:115c:a1e0::1a01:202", sourcePort: 50_322 },
  ],
  [
    "25.10 publickey with certificate",
    "Accepted publickey for joshua from 100.101.2.3 port 49822 ssh2: ED25519-CERT SHA256:q1w2e3r4 ID joshua@laptop (serial 7) CA ED25519 SHA256:ca1",
    { username: "joshua", result: "success", method: "publickey", sourceAddress: "100.101.2.3", sourcePort: 49_822 },
  ],
  [
    "22.04 failed password",
    "Failed password for root from 218.92.0.112 port 61022 ssh2",
    { username: "root", result: "failure", method: "password", sourceAddress: "218.92.0.112", sourcePort: 61_022 },
  ],
  [
    "24.04 failed password IPv6",
    "Failed password for ubuntu from 2a01:4f8:c17:1a2b::1 port 39112 ssh2",
    { username: "ubuntu", result: "failure", method: "password", sourceAddress: "2a01:4f8:c17:1a2b::1", sourcePort: 39_112 },
  ],
  [
    "22.04 failed password invalid user",
    "Failed password for invalid user admin from 185.220.101.34 port 40112 ssh2",
    { username: "admin", result: "invalid_user", method: "password", sourceAddress: "185.220.101.34", sourcePort: 40_112 },
  ],
  [
    "25.10 failed password invalid user",
    "Failed password for invalid user oracle from 45.148.10.240 port 58712 ssh2",
    { username: "oracle", result: "invalid_user", method: "password", sourceAddress: "45.148.10.240", sourcePort: 58_712 },
  ],
  [
    "failed password invalid empty user",
    "Failed password for invalid user  from 103.145.13.9 port 51234 ssh2",
    { username: "", result: "invalid_user", method: "password", sourceAddress: "103.145.13.9", sourcePort: 51_234 },
  ],
  [
    "24.04 failed publickey",
    "Failed publickey for git from 192.168.1.77 port 51022 ssh2: ECDSA SHA256:hJk4lMn5OpQ6",
    { username: "git", result: "failure", method: "publickey", sourceAddress: "192.168.1.77", sourcePort: 51_022 },
  ],
  [
    "failed keyboard-interactive",
    "Failed keyboard-interactive/pam for invalid user test from 141.98.11.11 port 44102 ssh2",
    { username: "test", result: "invalid_user", method: "keyboard-interactive/pam", sourceAddress: "141.98.11.11", sourcePort: 44_102 },
  ],
  [
    "failed none",
    "Failed none for invalid user support from 80.94.95.115 port 52110 ssh2",
    { username: "support", result: "invalid_user", method: "none", sourceAddress: "80.94.95.115", sourcePort: 52_110 },
  ],
  [
    "22.04 invalid user",
    "Invalid user admin from 185.220.101.34 port 40112",
    { username: "admin", result: "invalid_user", method: "none", sourceAddress: "185.220.101.34", sourcePort: 40_112 },
  ],
  [
    "25.10 invalid user",
    "Invalid user postgres from 194.169.175.36 port 35002",
    { username: "postgres", result: "invalid_user", method: "none", sourceAddress: "194.169.175.36", sourcePort: 35_002 },
  ],
  [
    "invalid empty user",
    "Invalid user  from 103.145.13.9 port 51234",
    { username: "", result: "invalid_user", method: "none", sourceAddress: "103.145.13.9", sourcePort: 51_234 },
  ],
  [
    "invalid user with space",
    "Invalid user sys admin from 103.145.13.9 port 51300",
    { username: "sys admin", result: "invalid_user", method: "none", sourceAddress: "103.145.13.9", sourcePort: 51_300 },
  ],
  [
    "invalid user without port (older format)",
    "Invalid user pi from 61.177.172.140",
    { username: "pi", result: "invalid_user", method: "none", sourceAddress: "61.177.172.140", sourcePort: null },
  ],
  [
    "24.04 connection closed by authenticating user",
    "Connection closed by authenticating user root 45.148.10.240 port 33912 [preauth]",
    { username: "root", result: "failure", method: "none", sourceAddress: "45.148.10.240", sourcePort: 33_912 },
  ],
  [
    "25.10 connection closed by authenticating user IPv6",
    "Connection closed by authenticating user joshua 2a01:4f8:c17:1a2b::1 port 40002 [preauth]",
    { username: "joshua", result: "failure", method: "none", sourceAddress: "2a01:4f8:c17:1a2b::1", sourcePort: 40_002 },
  ],
  ["disconnected from invalid user (follow-up)", "Disconnected from invalid user admin 185.220.101.34 port 40112 [preauth]", null],
  ["connection closed by invalid user (follow-up)", "Connection closed by invalid user admin 185.220.101.34 port 40112 [preauth]", null],
  ["disconnected from authenticating user (follow-up)", "Disconnected from authenticating user root 218.92.0.112 port 61022 [preauth]", null],
  ["max attempts (follow-up)", "error: maximum authentication attempts exceeded for root from 218.92.0.112 port 61022 ssh2 [preauth]", null],
  ["disconnecting authenticating user", "Disconnecting authenticating user root 218.92.0.112 port 61022: Too many authentication failures [preauth]", null],
  ["received disconnect", "Received disconnect from 185.220.101.34 port 40112:11: Bye Bye [preauth]", null],
  ["closed without user", "Connection closed by 167.94.138.44 port 43912 [preauth]", null],
  ["banner exchange", "banner exchange: Connection from 167.94.146.59 port 51786: invalid format", null],
  ["session opened", "pam_unix(sshd:session): session opened for user joshua(uid=1000) by joshua(uid=0)", null],
  ["session closed", "pam_unix(sshd:session): session closed for user joshua", null],
  ["auth failure pam", "pam_unix(sshd:auth): authentication failure; logname= uid=0 euid=0 tty=ssh ruser= rhost=218.92.0.112  user=root", null],
  ["postponed", "Postponed publickey for joshua from 100.101.2.3 port 52144 ssh2 [preauth]", null],
  ["listener", "Server listening on 0.0.0.0 port 22.", null],
  ["listener IPv6", "Server listening on :: port 22.", null],
  ["user logout", "Disconnected from user joshua 100.101.2.3 port 52144", null],
  ["timeout", "Timeout before authentication for 193.32.162.20 port 50132", null],
  ["kex", "Unable to negotiate with 92.255.85.37 port 61224: no matching host key type found. Their offer: ssh-rsa,ssh-dss [preauth]", null],
];

describe("parseSshdLine", () => {
  test("covers at least 30 real sshd lines", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(30);
  });

  test.each(CASES)("%s", (_, line, expected) => {
    const event = parseSshdLine(line, TIMESTAMP);
    if (expected === null) {
      expect(event).toBeNull();
      return;
    }
    expect(event).toEqual({ ...expected, timestamp: TIMESTAMP, channel: "ssh", raw: line });
  });

  test("strips classic and RFC 3339 syslog prefixes, including sshd-session", () => {
    const classic = "Oct 18 14:05:37 homelab sshd[41301]: Failed password for root from 218.92.0.112 port 61022 ssh2";
    const modern =
      "2026-10-18T14:05:37.412398+00:00 homelab sshd-session[41301]: Accepted publickey for joshua from 100.101.2.3 port 52144 ssh2: ED25519 SHA256:abc";
    expect(parseSshdLine(classic, TIMESTAMP)).toMatchObject({ username: "root", result: "failure", raw: classic });
    expect(parseSshdLine(modern, TIMESTAMP)).toMatchObject({ username: "joshua", result: "success", sourcePort: 52_144 });
  });

  test("unwraps rsyslog 'message repeated' lines into one event", () => {
    const line = "message repeated 2 times: [ Failed password for root from 218.92.0.112 port 61022 ssh2]";
    expect(parseSshdLine(line, TIMESTAMP)).toMatchObject({ username: "root", result: "failure", sourcePort: 61_022 });
  });

  test("counts an auth.log excerpt from Ubuntu 22.04 without follow-up duplicates", () => {
    const events = readFixture("auth-log-ubuntu-22.04.log")
      .split("\n")
      .map((line) => parseSshdLine(line, TIMESTAMP))
      .filter((event) => event !== null);
    expect(events.map((event) => [event.result, event.username])).toEqual([
      ["success", "joshua"],
      ["invalid_user", "admin"],
      ["invalid_user", "admin"],
      ["failure", "root"],
      ["failure", "root"],
      ["failure", "ubuntu"],
    ]);
  });
});
