import type { FirewallRule, FirewallState, SecurityAction } from "@/lib/security/security-types";

/*
 * Stops the most common way to lose a remote server: turning on a deny-by-default firewall (or
 * removing the last rule that lets you in) while connected over SSH or the tailnet. The page
 * shows the reason and lets the admin override it after confirming they have another way in.
 */

const SSH_TARGET_PATTERN = /^(22(\/tcp)?|OpenSSH)(\s|$)/i;
const TAILNET_INTERFACE_PATTERN = /\bon tailscale0\b/i;

/** Whether a rule lets you back in: SSH (port 22 or the OpenSSH profile) or anything on tailscale0. */
export function isRemoteAccessRule(rule: FirewallRule): boolean {
  const isIncomingAllow = /^(ALLOW|LIMIT)( IN)?$/i.test(rule.action.trim());
  if (!isIncomingAllow) return false;
  return SSH_TARGET_PATTERN.test(rule.to) || TAILNET_INTERFACE_PATTERN.test(rule.to);
}

const isBlockingPolicy = (policy: string | undefined) => policy === undefined || policy === "deny" || policy === "reject";

export interface LockoutCheck {
  isRisky: boolean;
  reason: string | null;
}

const SAFE: LockoutCheck = { isRisky: false, reason: null };
const NO_WAY_IN = "There is no rule allowing SSH (port 22) or the tailscale0 interface, and incoming traffic is blocked by default. You would lose remote access to this server, including this page.";

/**
 * Whether `action` could lock you out of the server, given the current firewall state.
 */
export function checkLockoutRisk(firewall: FirewallState, action: SecurityAction): LockoutCheck {
  const remoteAccessRules = firewall.rules.filter((rule) => isRemoteAccessRule(rule));
  const blocksIncoming = isBlockingPolicy(firewall.defaults?.incoming);
  switch (action.kind) {
    case "firewall-enable": {
      return blocksIncoming && remoteAccessRules.length === 0 ? { isRisky: true, reason: NO_WAY_IN } : SAFE;
    }
    case "firewall-default": {
      if (action.direction !== "incoming" || action.policy === "allow" || firewall.status !== "active") return SAFE;
      return remoteAccessRules.length === 0 ? { isRisky: true, reason: NO_WAY_IN } : SAFE;
    }
    case "firewall-delete-rule": {
      const rule = firewall.rules.find((candidate) => candidate.number === action.ruleNumber);
      if (!rule || firewall.status !== "active" || !blocksIncoming || !isRemoteAccessRule(rule)) return SAFE;
      const remainingRules = remoteAccessRules.filter((candidate) => candidate.number !== rule.number && candidate.isIpv6 === rule.isIpv6);
      return remainingRules.length === 0 ? { isRisky: true, reason: "This is the last rule that lets you in over SSH or the tailnet. Deleting it would block remote access to this server, including this page." } : SAFE;
    }
    default: {
      return SAFE;
    }
  }
}
