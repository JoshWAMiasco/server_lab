import { MOCK_ATTACKER_ADDRESSES } from "@/collector/drivers/mock/mock-fixtures";
import { buildActionCommands, formatCommandLine } from "@/lib/security/security-commands";
import type { Fail2banJail, FirewallRule, FirewallRuleInput, FirewallState, HostActionResult, SecurityAction, SecurityState } from "@/lib/security/security-types";
import { normalizeRuleText } from "@/lib/security/security-validation";

/*
 * In-memory UFW and fail2ban for development. Changes behave like the real tools closely enough
 * for the pages and E2E tests: rule numbers shift on delete, bans move between jails' lists, and
 * every result carries the same command lines the real helper would run.
 */

const ruleTo = (rule: FirewallRuleInput) => {
  const portPart = rule.port ? `${rule.port}${rule.protocol === "any" ? "" : `/${rule.protocol}`}` : "Anywhere";
  return rule.interfaceName ? `${portPart} on ${rule.interfaceName}` : portPart;
};

function toFirewallRule(number: number, to: string, action: string, from: string, comment: string | null): FirewallRule {
  const ruleText = normalizeRuleText(`${to} ${action} ${from}${comment ? ` # ${comment}` : ""}`);
  return { number, to, action, from, comment, isIpv6: to.includes("(v6)") || from.includes("(v6)"), ruleText };
}

/** The fake host's firewall and fail2ban, owned by `MockDriver`. */
export class MockSecurity {
  private firewallStatus: FirewallState["status"] = "active";
  private defaults = { incoming: "deny", outgoing: "allow", routed: "disabled" };
  private logging = "low";
  private rules: Omit<FirewallRule, "number">[] = [
    toFirewallRule(0, "22/tcp", "LIMIT IN", "Anywhere", "ssh, rate limited"),
    toFirewallRule(0, "Anywhere on tailscale0", "ALLOW IN", "Anywhere", "tailnet"),
    toFirewallRule(0, "8443", "DENY IN", "192.168.1.0/24", null),
    toFirewallRule(0, "22/tcp (v6)", "LIMIT IN", "Anywhere (v6)", "ssh, rate limited"),
    toFirewallRule(0, "Anywhere (v6) on tailscale0", "ALLOW IN", "Anywhere (v6)", "tailnet"),
  ];
  private readonly jails: Fail2banJail[] = [
    { name: "sshd", currentlyFailed: 4, totalFailed: 318, currentlyBanned: 3, totalBanned: 41, bannedAddresses: MOCK_ATTACKER_ADDRESSES.slice(0, 3), banTimeSeconds: 3600, findTimeSeconds: 600, maximumRetries: 5 },
    { name: "nginx-http-auth", currentlyFailed: 0, totalFailed: 12, currentlyBanned: 1, totalBanned: 2, bannedAddresses: MOCK_ATTACKER_ADDRESSES.slice(5, 6), banTimeSeconds: 600, findTimeSeconds: 600, maximumRetries: 5 },
  ];

  /** A snapshot of the fake host. */
  readState(): SecurityState {
    return {
      checkedAt: Date.now(),
      helper: "mock",
      helperMessage: null,
      firewall: {
        status: this.firewallStatus,
        defaults: this.firewallStatus === "active" ? { ...this.defaults } : null,
        logging: this.logging,
        rules: this.firewallStatus === "active" ? this.rules.map((rule, index) => ({ ...rule, number: index + 1 })) : [],
      },
      fail2ban: { status: "running", version: "1.1.0", jails: this.jails.map((jail) => ({ ...jail, bannedAddresses: [...jail.bannedAddresses] })) },
    };
  }

  /** Applies a change as ufw / fail2ban-client would, returning the same shape as the real helper. */
  run(requestId: string, action: Exclude<SecurityAction, { kind: "snapshot" }>): HostActionResult {
    const commandLine = buildActionCommands(action).map((command) => formatCommandLine(command)).join(" && ");
    const finish = (isSuccessful: boolean, output: string, errorMessage: string | null = null): HostActionResult => ({ requestId, isSuccessful, errorMessage, steps: [{ commandLine, exitCode: isSuccessful ? 0 : 1, output }], finishedAt: Date.now() });
    switch (action.kind) {
      case "fail2ban-ban":
      case "fail2ban-unban": {
        const jail = this.jails.find((candidate) => candidate.name === action.jail);
        if (!jail) return finish(false, `Sorry but the jail '${action.jail}' does not exist`, `${commandLine} failed: Sorry but the jail '${action.jail}' does not exist`);
        if (action.kind === "fail2ban-ban") {
          if (!jail.bannedAddresses.includes(action.address)) {
            jail.bannedAddresses.push(action.address);
            jail.totalBanned += 1;
          }
        } else {
          if (!jail.bannedAddresses.includes(action.address)) return finish(false, "0", `${commandLine} failed: ${action.address} is not banned in ${action.jail}`);
          jail.bannedAddresses = jail.bannedAddresses.filter((address) => address !== action.address);
        }
        jail.currentlyBanned = jail.bannedAddresses.length;
        return finish(true, "1");
      }
      case "firewall-enable": {
        this.firewallStatus = "active";
        return finish(true, "Firewall is active and enabled on system startup");
      }
      case "firewall-disable": {
        this.firewallStatus = "inactive";
        return finish(true, "Firewall stopped and disabled on system startup");
      }
      case "firewall-default": {
        this.defaults[action.direction] = action.policy;
        return finish(true, `Default ${action.direction} policy changed to '${action.policy}'\n(be sure to update your rules accordingly)`);
      }
      case "firewall-logging": {
        this.logging = action.level;
        return finish(true, action.level === "off" ? "Logging disabled" : "Logging enabled");
      }
      case "firewall-add-rule": {
        const { rule } = action;
        const direction = rule.direction === "in" ? "IN" : "OUT";
        const from = rule.fromAddress ?? "Anywhere";
        this.rules.push(toFirewallRule(0, ruleTo(rule), `${rule.action.toUpperCase()} ${direction}`, from, rule.comment));
        if (rule.fromAddress) return finish(true, "Rule added");
        this.rules.push(toFirewallRule(0, ruleTo(rule).replace(/^(\S+)/, "$1 (v6)"), `${rule.action.toUpperCase()} ${direction}`, "Anywhere (v6)", rule.comment));
        return finish(true, "Rule added\nRule added (v6)");
      }
      case "firewall-delete-rule": {
        const rule = this.rules[action.ruleNumber - 1];
        if (!rule || rule.ruleText !== normalizeRuleText(action.expectedRuleText)) return finish(false, "", `Rule ${action.ruleNumber} changed since the page loaded, so nothing was deleted. Refresh and try again.`);
        this.rules.splice(action.ruleNumber - 1, 1);
        return finish(true, "Rule deleted");
      }
    }
  }
}
