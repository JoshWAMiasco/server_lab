import { describe, expect, test } from "vitest";
import { checkLockoutRisk, isRemoteAccessRule } from "@/lib/security/lockout-guard";
import type { FirewallRule, FirewallState } from "@/lib/security/security-types";

const rule = (number: number, to: string, action = "ALLOW IN", isIpv6 = false): FirewallRule => ({ number, to, action, from: "Anywhere", comment: null, isIpv6, ruleText: `${to} ${action} Anywhere` });
const firewall = (status: FirewallState["status"], rules: FirewallRule[], incoming = "deny"): FirewallState => ({ status, defaults: { incoming, outgoing: "allow", routed: "disabled" }, logging: "low", rules });

describe("isRemoteAccessRule", () => {
  test.each([
    [rule(1, "22/tcp"), true],
    [rule(1, "22"), true],
    [rule(1, "OpenSSH"), true],
    [rule(1, "Anywhere on tailscale0"), true],
    [rule(1, "22/tcp", "LIMIT IN"), true],
    [rule(1, "22/tcp", "DENY IN"), false],
    [rule(1, "2222/tcp"), false],
    [rule(1, "443/tcp"), false],
    [rule(1, "22/tcp", "ALLOW OUT"), false],
  ])("%j → %s", (candidate, expected) => {
    expect(isRemoteAccessRule(candidate)).toBe(expected);
  });
});

describe("checkLockoutRisk", () => {
  test("enabling with no way in is risky", () => {
    expect(checkLockoutRisk(firewall("inactive", []), { kind: "firewall-enable" }).isRisky).toBe(true);
  });

  test("enabling with an SSH rule is safe", () => {
    expect(checkLockoutRisk(firewall("inactive", [rule(1, "22/tcp")]), { kind: "firewall-enable" }).isRisky).toBe(false);
  });

  test("enabling with incoming allowed by default is safe", () => {
    expect(checkLockoutRisk(firewall("inactive", [], "allow"), { kind: "firewall-enable" }).isRisky).toBe(false);
  });

  test("unknown defaults count as blocking", () => {
    expect(checkLockoutRisk({ status: "inactive", defaults: null, logging: null, rules: [] }, { kind: "firewall-enable" }).isRisky).toBe(true);
  });

  test("deny incoming on an active firewall with no way in is risky", () => {
    expect(checkLockoutRisk(firewall("active", [rule(1, "443/tcp")], "allow"), { kind: "firewall-default", direction: "incoming", policy: "deny" }).isRisky).toBe(true);
    expect(checkLockoutRisk(firewall("active", [rule(1, "443/tcp")], "allow"), { kind: "firewall-default", direction: "outgoing", policy: "deny" }).isRisky).toBe(false);
  });

  test("deleting the last remote access rule is risky", () => {
    const state = firewall("active", [rule(1, "22/tcp"), rule(2, "443/tcp"), rule(3, "22/tcp (v6)", "ALLOW IN", true)]);
    expect(checkLockoutRisk(state, { kind: "firewall-delete-rule", ruleNumber: 1, expectedRuleText: "22/tcp ALLOW IN Anywhere" }).isRisky).toBe(true);
    expect(checkLockoutRisk(state, { kind: "firewall-delete-rule", ruleNumber: 2, expectedRuleText: "443/tcp ALLOW IN Anywhere" }).isRisky).toBe(false);
  });

  test("deleting one of two remote access rules is safe", () => {
    const state = firewall("active", [rule(1, "22/tcp"), rule(2, "Anywhere on tailscale0")]);
    expect(checkLockoutRisk(state, { kind: "firewall-delete-rule", ruleNumber: 1, expectedRuleText: "22/tcp ALLOW IN Anywhere" }).isRisky).toBe(false);
  });

  test("deleting rules on an inactive firewall is safe", () => {
    expect(checkLockoutRisk(firewall("inactive", [rule(1, "22/tcp")]), { kind: "firewall-delete-rule", ruleNumber: 1, expectedRuleText: "22/tcp ALLOW IN Anywhere" }).isRisky).toBe(false);
  });
});
