import type { FirewallRuleInput, SecurityAction } from "@/lib/security/security-types";

/** A program and its arguments, run without a shell. */
export interface HostCommand {
  program: "ufw" | "fail2ban-client";
  commandArguments: string[];
}

const SHELL_SAFE_PATTERN = /^[A-Za-z0-9_./:@%+=,-]+$/;

/** Quotes one argument the way you would type it in bash. */
export function quoteShellArgument(argument: string): string {
  if (SHELL_SAFE_PATTERN.test(argument)) return argument;
  return `'${argument.replaceAll("'", String.raw`'\''`)}'`;
}

/**
 * The command as you would type it in a terminal, e.g.
 * `sudo ufw allow in on tailscale0 proto tcp from any to any port 22`.
 */
export function formatCommandLine(command: HostCommand): string {
  return ["sudo", command.program, ...command.commandArguments].map((argument) => quoteShellArgument(argument)).join(" ");
}

/**
 * The `ufw` arguments for a new rule, in the order `man ufw` documents:
 * `allow|deny|reject|limit [in|out [on INTERFACE]] [proto PROTOCOL] [from ADDRESS] [to any [port PORT]] [comment TEXT]`.
 * A rule that only names an interface stays short: `allow in on tailscale0`.
 */
export function buildFirewallRuleArguments(rule: FirewallRuleInput): string[] {
  const commandArguments: string[] = [rule.action, rule.direction];
  if (rule.interfaceName) commandArguments.push("on", rule.interfaceName);
  const needsAddressPart = Boolean(rule.fromAddress || rule.port || rule.protocol !== "any");
  if (needsAddressPart) {
    if (rule.protocol !== "any") commandArguments.push("proto", rule.protocol);
    commandArguments.push("from", rule.fromAddress ?? "any", "to", "any");
    if (rule.port) commandArguments.push("port", rule.port);
  }
  if (rule.comment) commandArguments.push("comment", rule.comment);
  return commandArguments;
}

/**
 * The commands that carry out a change. `snapshot` has none here: it runs a read-only set of
 * commands that depends on what is installed (see `buildSnapshotCommands`). Confirmation prompts
 * are skipped with `--force`, which is also what the page shows.
 */
export function buildActionCommands(action: Exclude<SecurityAction, { kind: "snapshot" }>): HostCommand[] {
  switch (action.kind) {
    case "fail2ban-ban": {
      return [{ program: "fail2ban-client", commandArguments: ["set", action.jail, "banip", action.address] }];
    }
    case "fail2ban-unban": {
      return [{ program: "fail2ban-client", commandArguments: ["set", action.jail, "unbanip", action.address] }];
    }
    case "firewall-enable": {
      return [{ program: "ufw", commandArguments: ["--force", "enable"] }];
    }
    case "firewall-disable": {
      return [{ program: "ufw", commandArguments: ["disable"] }];
    }
    case "firewall-default": {
      return [{ program: "ufw", commandArguments: ["default", action.policy, action.direction] }];
    }
    case "firewall-logging": {
      return [{ program: "ufw", commandArguments: ["logging", action.level] }];
    }
    case "firewall-add-rule": {
      return [{ program: "ufw", commandArguments: buildFirewallRuleArguments(action.rule) }];
    }
    case "firewall-delete-rule": {
      return [{ program: "ufw", commandArguments: ["--force", "delete", String(action.ruleNumber)] }];
    }
  }
}

/** The read-only commands behind the pages, before per-jail details are known. */
export const SNAPSHOT_BASE_COMMANDS: readonly HostCommand[] = [
  { program: "ufw", commandArguments: ["status", "verbose"] },
  { program: "ufw", commandArguments: ["status", "numbered"] },
  { program: "fail2ban-client", commandArguments: ["version"] },
  { program: "fail2ban-client", commandArguments: ["status"] },
];

/** The read-only commands for one jail's counts, banned addresses and timing settings. */
export function buildJailSnapshotCommands(jail: string): HostCommand[] {
  return [
    { program: "fail2ban-client", commandArguments: ["status", jail] },
    { program: "fail2ban-client", commandArguments: ["get", jail, "bantime"] },
    { program: "fail2ban-client", commandArguments: ["get", jail, "findtime"] },
    { program: "fail2ban-client", commandArguments: ["get", jail, "maxretry"] },
  ];
}

/** A short, human summary of an action for the activity log, e.g. "Ban 203.0.113.7 in sshd". */
export function describeSecurityAction(action: SecurityAction): string {
  switch (action.kind) {
    case "snapshot": {
      return "Refresh status";
    }
    case "fail2ban-ban": {
      return `Ban ${action.address} in ${action.jail}`;
    }
    case "fail2ban-unban": {
      return `Unban ${action.address} from ${action.jail}`;
    }
    case "firewall-enable": {
      return "Turn the firewall on";
    }
    case "firewall-disable": {
      return "Turn the firewall off";
    }
    case "firewall-default": {
      return `Set the ${action.direction} default to ${action.policy}`;
    }
    case "firewall-logging": {
      return `Set firewall logging to ${action.level}`;
    }
    case "firewall-add-rule": {
      return `Add rule: ${buildFirewallRuleArguments(action.rule).join(" ")}`;
    }
    case "firewall-delete-rule": {
      return `Delete rule ${action.ruleNumber}: ${action.expectedRuleText}`;
    }
  }
}
