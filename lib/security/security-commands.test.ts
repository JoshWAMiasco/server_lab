import { describe, expect, test } from "vitest";
import { buildActionCommands, buildFirewallRuleArguments, describeSecurityAction, formatCommandLine, quoteShellArgument } from "@/lib/security/security-commands";
import { firewallRuleInputSchema, hostActionRequestSchema, isAddressOrNetwork, isValidPort, securityActionSchema } from "@/lib/security/security-validation";
import type { FirewallRuleInput } from "@/lib/security/security-types";

const baseRule: FirewallRuleInput = { action: "allow", direction: "in", interfaceName: null, fromAddress: null, port: null, protocol: "any", comment: null };

describe("buildFirewallRuleArguments", () => {
  test("interface-only rule stays short", () => {
    expect(buildFirewallRuleArguments({ ...baseRule, interfaceName: "tailscale0" })).toEqual(["allow", "in", "on", "tailscale0"]);
  });

  test("full rule follows the man page order", () => {
    const rule: FirewallRuleInput = { action: "allow", direction: "in", interfaceName: "tailscale0", fromAddress: "100.64.0.0/10", port: "22", protocol: "tcp", comment: "ssh via tailnet" };
    expect(formatCommandLine({ program: "ufw", commandArguments: buildFirewallRuleArguments(rule) })).toBe("sudo ufw allow in on tailscale0 proto tcp from 100.64.0.0/10 to any port 22 comment 'ssh via tailnet'");
  });

  test("port only", () => {
    expect(buildFirewallRuleArguments({ ...baseRule, action: "limit", port: "22", protocol: "tcp" })).toEqual(["limit", "in", "proto", "tcp", "from", "any", "to", "any", "port", "22"]);
  });

  test("source address only", () => {
    expect(buildFirewallRuleArguments({ ...baseRule, action: "deny", fromAddress: "203.0.113.7" })).toEqual(["deny", "in", "from", "203.0.113.7", "to", "any"]);
  });
});

describe("buildActionCommands", () => {
  test.each([
    [{ kind: "fail2ban-ban", jail: "sshd", address: "203.0.113.7" } as const, "sudo fail2ban-client set sshd banip 203.0.113.7"],
    [{ kind: "fail2ban-unban", jail: "sshd", address: "2001:db8::1" } as const, "sudo fail2ban-client set sshd unbanip 2001:db8::1"],
    [{ kind: "firewall-enable" } as const, "sudo ufw --force enable"],
    [{ kind: "firewall-disable" } as const, "sudo ufw disable"],
    [{ kind: "firewall-default", direction: "incoming", policy: "deny" } as const, "sudo ufw default deny incoming"],
    [{ kind: "firewall-logging", level: "medium" } as const, "sudo ufw logging medium"],
    [{ kind: "firewall-delete-rule", ruleNumber: 3, expectedRuleText: "8443 DENY IN 192.168.1.0/24" } as const, "sudo ufw --force delete 3"],
  ])("%j", (action, expected) => {
    expect(buildActionCommands(action).map((command) => formatCommandLine(command))).toEqual([expected]);
  });

  test("describes actions for the activity log", () => {
    expect(describeSecurityAction({ kind: "fail2ban-ban", jail: "sshd", address: "203.0.113.7" })).toBe("Ban 203.0.113.7 in sshd");
  });
});

describe("quoteShellArgument", () => {
  test("quotes spaces and single quotes", () => {
    expect(quoteShellArgument("plain-word")).toBe("plain-word");
    expect(quoteShellArgument("two words")).toBe("'two words'");
    expect(quoteShellArgument("it's")).toBe(String.raw`'it'\''s'`);
  });
});

describe("validation", () => {
  test.each(["203.0.113.7", "2001:db8::1", "100.64.0.0/10", "fd7a:115c:a1e0::/48", "0.0.0.0/0"])("accepts %s", (value) => {
    expect(isAddressOrNetwork(value)).toBe(true);
  });

  test.each(["1.1.1.1; rm -rf /", "1.2.3.4/33", "999.1.1.1", "any", "1.2.3.4/8/8", "-1.2.3.4", "$(reboot)"])("rejects address %j", (value) => {
    expect(isAddressOrNetwork(value)).toBe(false);
  });

  test.each([
    ["22", true],
    ["65535", true],
    ["6000:6007", true],
    ["0", false],
    ["65536", false],
    ["6007:6000", false],
    ["22:22", false],
    ["22,80", false],
    ["ssh", false],
  ])("port %j is %s", (value, expected) => {
    expect(isValidPort(value)).toBe(expected);
  });

  test("rule needs a port, address or interface", () => {
    expect(firewallRuleInputSchema.safeParse(baseRule).success).toBe(false);
  });

  test("port range needs a protocol", () => {
    const result = firewallRuleInputSchema.safeParse({ ...baseRule, port: "6000:6007" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/protocol/);
  });

  test("limit only on incoming", () => {
    expect(firewallRuleInputSchema.safeParse({ ...baseRule, action: "limit", direction: "out", port: "22" }).success).toBe(false);
  });

  test("blank text fields become null", () => {
    expect(firewallRuleInputSchema.parse({ ...baseRule, interfaceName: " ", fromAddress: "", port: " 22 ", comment: "" })).toEqual({ ...baseRule, port: "22" });
  });

  test.each([
    { ...baseRule, port: "22", comment: "x'; reboot; '" },
    { ...baseRule, interfaceName: "eth0 --force" },
    { ...baseRule, port: "22", extra: "field" },
  ])("rejects unsafe rule %j", (rule) => {
    expect(firewallRuleInputSchema.safeParse(rule).success).toBe(false);
  });

  test.each([
    { kind: "fail2ban-ban", jail: "sshd; reboot", address: "203.0.113.7" },
    { kind: "fail2ban-ban", jail: "sshd", address: "203.0.113.0/24" },
    { kind: "fail2ban-unban", jail: "sshd", address: "1.1.1.1 --help" },
    { kind: "firewall-default", direction: "incoming", policy: "drop" },
    { kind: "firewall-logging", level: "everything" },
    { kind: "firewall-delete-rule", ruleNumber: 0, expectedRuleText: "x" },
    { kind: "firewall-delete-rule", ruleNumber: 1.5, expectedRuleText: "x" },
    { kind: "reboot" },
    { kind: "firewall-enable", extra: true },
  ])("rejects action %j", (action) => {
    expect(securityActionSchema.safeParse(action).success).toBe(false);
  });

  test("request ids are plain", () => {
    expect(hostActionRequestSchema.safeParse({ requestId: "../../etc/passwd", action: { kind: "snapshot" } }).success).toBe(false);
    expect(hostActionRequestSchema.safeParse({ requestId: "1730458000000-ab12cd", action: { kind: "snapshot" } }).success).toBe(true);
  });
});
