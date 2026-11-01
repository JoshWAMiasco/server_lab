/*
 * Shared types for the Firewall (UFW) and fail2ban pages. The web process writes requested
 * actions to the `host_action_requests` table, the collector hands them to the root helper
 * (host-action/), and the collector publishes the parsed host state as the `security` capability.
 */

export const SECURITY_CAPABILITY_KEY = "security";
export const SECURITY_REFRESH_REQUEST_KEY = "security.refreshRequestedAt";

export type FirewallRuleAction = "allow" | "deny" | "reject" | "limit";
export type FirewallRuleDirection = "in" | "out";
export type FirewallProtocol = "any" | "tcp" | "udp";
export type FirewallPolicy = "allow" | "deny" | "reject";
export type FirewallPolicyDirection = "incoming" | "outgoing" | "routed";
export type FirewallLoggingLevel = "off" | "low" | "medium" | "high" | "full";

export const FIREWALL_RULE_ACTIONS: readonly FirewallRuleAction[] = ["allow", "deny", "reject", "limit"];
export const FIREWALL_RULE_DIRECTIONS: readonly FirewallRuleDirection[] = ["in", "out"];
export const FIREWALL_PROTOCOLS: readonly FirewallProtocol[] = ["any", "tcp", "udp"];
export const FIREWALL_POLICIES: readonly FirewallPolicy[] = ["allow", "deny", "reject"];
export const FIREWALL_POLICY_DIRECTIONS: readonly FirewallPolicyDirection[] = ["incoming", "outgoing", "routed"];
export const FIREWALL_LOGGING_LEVELS: readonly FirewallLoggingLevel[] = ["off", "low", "medium", "high", "full"];

/** A rule to add, as the form collects it. `null` fields are left out of the command. */
export interface FirewallRuleInput {
  action: FirewallRuleAction;
  direction: FirewallRuleDirection;
  interfaceName: string | null;
  fromAddress: string | null;
  port: string | null;
  protocol: FirewallProtocol;
  comment: string | null;
}

/** Everything the root helper may do. `snapshot` only reads; the rest change the host. */
export type SecurityAction =
  | { kind: "snapshot" }
  | { kind: "fail2ban-ban"; jail: string; address: string }
  | { kind: "fail2ban-unban"; jail: string; address: string }
  | { kind: "firewall-enable" }
  | { kind: "firewall-disable" }
  | { kind: "firewall-default"; direction: FirewallPolicyDirection; policy: FirewallPolicy }
  | { kind: "firewall-logging"; level: FirewallLoggingLevel }
  | { kind: "firewall-add-rule"; rule: FirewallRuleInput }
  | { kind: "firewall-delete-rule"; ruleNumber: number; expectedRuleText: string };

export type SecurityActionKind = SecurityAction["kind"];

/** One command the helper ran, with what it printed (stdout and stderr, trimmed and capped). */
export interface CommandStep {
  commandLine: string;
  exitCode: number | null;
  output: string;
}

/** What the helper reports for one request. */
export interface HostActionResult {
  requestId: string;
  isSuccessful: boolean;
  errorMessage: string | null;
  steps: CommandStep[];
  finishedAt: number;
}

export interface Fail2banJail {
  name: string;
  currentlyFailed: number;
  totalFailed: number;
  currentlyBanned: number;
  totalBanned: number;
  bannedAddresses: string[];
  banTimeSeconds: number | null;
  findTimeSeconds: number | null;
  maximumRetries: number | null;
}

export interface Fail2banState {
  status: "not-installed" | "stopped" | "running" | "unknown";
  version: string | null;
  jails: Fail2banJail[];
}

export interface FirewallRule {
  number: number;
  to: string;
  action: string;
  from: string;
  comment: string | null;
  isIpv6: boolean;
  /** The rule line exactly as `ufw status numbered` prints it (spacing collapsed), used to confirm a delete. */
  ruleText: string;
}

export interface FirewallDefaults {
  incoming: string;
  outgoing: string;
  routed: string;
}

export interface FirewallState {
  status: "not-installed" | "inactive" | "active" | "unknown";
  defaults: FirewallDefaults | null;
  logging: string | null;
  rules: FirewallRule[];
  /** Saved rules from `ufw show added` (as `ufw …` commands). Listed even while the firewall is off. */
  addedRules: string[];
}

export type SecurityHelperStatus = "ready" | "not-installed" | "failed" | "mock";

export interface SecurityState {
  checkedAt: number;
  helper: SecurityHelperStatus;
  helperMessage: string | null;
  fail2ban: Fail2banState;
  firewall: FirewallState;
}
