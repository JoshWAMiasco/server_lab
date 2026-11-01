import { normalizeRuleText } from "@/lib/security/security-validation";
import type { FirewallDefaults, FirewallRule } from "@/lib/security/security-types";

export interface UfwVerboseStatus {
  status: "active" | "inactive" | "unknown";
  logging: string | null;
  defaults: FirewallDefaults | null;
}

/*
 * The action column always reads ALLOW, DENY, REJECT or LIMIT, optionally followed by IN, OUT or
 * FWD. Long "To" values (`Anywhere (v6) on tailscale0`) eat the column padding, so the line is
 * split on that word instead of on runs of spaces.
 */
const ACTION_PATTERN = /\s(ALLOW|DENY|REJECT|LIMIT)(?: (IN|OUT|FWD))?(?=\s|$)/;
const NUMBERED_LINE_PATTERN = /^\[\s*(\d+)\]\s+(.+)$/;
const UFW_POLICY_BY_TARGET: Record<string, string> = { DROP: "deny", ACCEPT: "allow", REJECT: "reject" };

/**
 * Reads `ufw status verbose`: whether the firewall is on, the logging level and the default
 * policies. `ufw status` (not verbose) has no defaults line, which gives `defaults: null`.
 */
export function parseUfwStatusVerbose(text: string): UfwVerboseStatus {
  const statusMatch = /^Status:\s*(\w+)/m.exec(text);
  const status = statusMatch?.[1] === "active" ? "active" : statusMatch?.[1] === "inactive" ? "inactive" : "unknown";
  const loggingMatch = /^Logging:\s*(\w+)(?:\s*\((\w+)\))?/m.exec(text);
  const logging = loggingMatch ? (loggingMatch[1] === "off" ? "off" : (loggingMatch[2] ?? loggingMatch[1] ?? null)) : null;
  const defaultsMatch = /^Default:\s*(.+)$/m.exec(text);
  let defaults: FirewallDefaults | null = null;
  if (defaultsMatch) {
    const policyByDirection = new Map<string, string>();
    for (const part of (defaultsMatch[1] ?? "").split(",")) {
      const [, policy, direction] = /(\w+)\s*\((\w+)\)/.exec(part.trim()) ?? [];
      if (policy && direction) policyByDirection.set(direction, policy);
    }
    defaults = { incoming: policyByDirection.get("incoming") ?? "unknown", outgoing: policyByDirection.get("outgoing") ?? "unknown", routed: policyByDirection.get("routed") ?? "unknown" };
  }
  return { status, logging, defaults };
}

/**
 * Reads the rules from `ufw status numbered`. Rule numbers are what `ufw delete NUMBER` takes;
 * IPv6 copies of a rule get their own number and `(v6)` in the address columns.
 */
export function parseUfwStatusNumbered(text: string): FirewallRule[] {
  const rules: FirewallRule[] = [];
  for (const line of text.split("\n")) {
    const [, numberText, ruleBody] = NUMBERED_LINE_PATTERN.exec(line.trim()) ?? [];
    if (!numberText || !ruleBody) continue;
    const actionMatch = ACTION_PATTERN.exec(ruleBody);
    if (!actionMatch?.[1]) continue;
    const to = ruleBody.slice(0, actionMatch.index).trim();
    const action = actionMatch[2] ? `${actionMatch[1]} ${actionMatch[2]}` : actionMatch[1];
    let remainder = ruleBody.slice(actionMatch.index + actionMatch[0].length).trim();
    let comment: string | null = null;
    const commentMatch = /\s#\s(.*)$/.exec(` ${remainder}`);
    if (commentMatch) {
      comment = commentMatch[1]?.trim() || null;
      remainder = ` ${remainder}`.slice(0, commentMatch.index).trim();
    }
    const from = remainder.replace(/\s*\(out\)$/, "").trim();
    rules.push({ number: Number(numberText), to, action, from, comment, isIpv6: to.includes("(v6)") || from.includes("(v6)"), ruleText: normalizeRuleText(ruleBody) });
  }
  return rules;
}

/**
 * Reads `ufw show added`: the saved rules as the `ufw …` commands that would recreate them. Unlike
 * `ufw status`, it lists rules while the firewall is turned off.
 */
export function parseUfwShowAdded(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("ufw "));
}

/**
 * Reads `/etc/ufw/ufw.conf` and `/etc/default/ufw`, which are world-readable, for a basic status
 * when the root helper is not installed. `ENABLED=yes` is what `ufw enable` writes.
 */
export function parseUfwConfigurationFiles(ufwConfiguration: string, defaultsFile: string | null): UfwVerboseStatus {
  const isEnabled = /^ENABLED=yes\s*$/m.test(ufwConfiguration);
  const logLevel = /^LOGLEVEL=(\w+)/m.exec(ufwConfiguration)?.[1] ?? null;
  const policyFor = (chain: "INPUT" | "OUTPUT" | "FORWARD") => {
    const target = defaultsFile ? new RegExp(`^DEFAULT_${chain}_POLICY="?(\\w+)"?`, "m").exec(defaultsFile)?.[1] : undefined;
    if (!target) return "unknown";
    return UFW_POLICY_BY_TARGET[target] ?? target.toLowerCase();
  };
  const routedPolicy = policyFor("FORWARD");
  return {
    status: isEnabled ? "active" : "inactive",
    logging: logLevel,
    defaults: defaultsFile ? { incoming: policyFor("INPUT"), outgoing: policyFor("OUTPUT"), routed: routedPolicy === "deny" ? "disabled" : routedPolicy } : null,
  };
}
