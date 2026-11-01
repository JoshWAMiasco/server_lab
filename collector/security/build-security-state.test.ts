import { describe, expect, test } from "vitest";
import { readFixture } from "@/collector/parsers/read-fixture";
import { buildFail2banState, buildFirewallState } from "@/collector/security/build-security-state";
import { PROGRAM_NOT_FOUND_OUTPUT } from "@/host-action/execute-host-action";
import type { CommandStep } from "@/lib/security/security-types";

const step = (commandLine: string, output: string, exitCode: number | null = 0): CommandStep => ({ commandLine, exitCode, output });

describe("buildFirewallState", () => {
  test("active firewall with rules", () => {
    const state = buildFirewallState([step("sudo ufw status verbose", readFixture("ufw-status-verbose-active.txt")), step("sudo ufw status numbered", readFixture("ufw-status-numbered-active.txt"))]);
    expect(state).toMatchObject({ status: "active", logging: "low", defaults: { incoming: "deny" } });
    expect(state.rules).toHaveLength(8);
  });

  test("ufw not installed", () => {
    expect(buildFirewallState([step("sudo ufw status verbose", PROGRAM_NOT_FOUND_OUTPUT, null)]).status).toBe("not-installed");
  });
});

describe("buildFail2banState", () => {
  test("running server with jail details", () => {
    const state = buildFail2banState([
      step("sudo fail2ban-client version", "1.1.0"),
      step("sudo fail2ban-client status", readFixture("fail2ban-client-status.txt")),
      step("sudo fail2ban-client status sshd", readFixture("fail2ban-client-status-sshd.txt")),
      step("sudo fail2ban-client get sshd bantime", "3600"),
      step("sudo fail2ban-client get sshd findtime", "600"),
      step("sudo fail2ban-client get sshd maxretry", "5"),
    ]);
    expect(state.status).toBe("running");
    expect(state.version).toBe("1.1.0");
    expect(state.jails.map((jail) => jail.name)).toEqual(["nginx-http-auth", "sshd"]);
    expect(state.jails[1]).toMatchObject({ currentlyBanned: 2, banTimeSeconds: 3600, findTimeSeconds: 600, maximumRetries: 5 });
    expect(state.jails[0]).toMatchObject({ currentlyBanned: 0, banTimeSeconds: null });
  });

  test("installed but the server is stopped", () => {
    expect(buildFail2banState([step("sudo fail2ban-client version", "1.1.0"), step("sudo fail2ban-client status", "ERROR   Failed to access socket path: /var/run/fail2ban/fail2ban.sock. Is fail2ban running?", 255)])).toEqual({ status: "stopped", version: "1.1.0", jails: [] });
  });

  test("not installed", () => {
    expect(buildFail2banState([step("sudo fail2ban-client version", PROGRAM_NOT_FOUND_OUTPUT, null), step("sudo fail2ban-client status", PROGRAM_NOT_FOUND_OUTPUT, null)]).status).toBe("not-installed");
  });
});
