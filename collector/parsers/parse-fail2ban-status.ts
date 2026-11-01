import type { Fail2banJail } from "@/lib/security/security-types";

const JAIL_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * The jail names from `fail2ban-client status` (`Jail list:\tnginx-http-auth, sshd`). Names that
 * are not plain words are dropped, since they are later passed back to fail2ban-client.
 */
export function parseFail2banJailList(text: string): string[] {
  const listMatch = /Jail list:[ \t]*(.*)$/m.exec(text);
  if (!listMatch) return [];
  return (listMatch[1] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => JAIL_NAME_PATTERN.test(name));
}

const readCount = (text: string, label: string) => {
  const match = new RegExp(`${label}:[ \\t]*(\\d+)`).exec(text);
  return match ? Number(match[1]) : 0;
};

/**
 * Reads `fail2ban-client status JAIL`: failed and banned counts and the banned addresses.
 * Timing settings come from separate `get` calls and start as null.
 */
export function parseFail2banJailStatus(name: string, text: string): Fail2banJail {
  const bannedMatch = /Banned IP list:[ \t]*(.*)$/m.exec(text);
  const bannedAddresses = (bannedMatch?.[1] ?? "").split(/\s+/).filter(Boolean);
  return {
    name,
    currentlyFailed: readCount(text, "Currently failed"),
    totalFailed: readCount(text, "Total failed"),
    currentlyBanned: readCount(text, "Currently banned"),
    totalBanned: readCount(text, "Total banned"),
    bannedAddresses,
    banTimeSeconds: null,
    findTimeSeconds: null,
    maximumRetries: null,
  };
}

/** The version from `fail2ban-client version` (`1.1.0`, or `Fail2Ban v1.0.2` on older releases). */
export function parseFail2banVersion(text: string): string | null {
  return /(\d+\.\d+(?:\.\d+)?)/.exec(text)?.[1] ?? null;
}

/** A number printed by `fail2ban-client get JAIL bantime|findtime|maxretry`, or null. */
export function parseFail2banNumber(text: string): number | null {
  const match = /^\s*(-?\d+)\s*$/.exec(text);
  return match ? Number(match[1]) : null;
}
