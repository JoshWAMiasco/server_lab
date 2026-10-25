import { isIPv4, isIPv6 } from "node:net";
import type { NetworkTag } from "../types";

/*
 * Address helpers shared by the ss, sshd, last and nginx parsers. Everything here is pure: addresses
 * are compared numerically (IPv4 as one unsigned 32-bit number, IPv6 as eight 16-bit groups).
 */

type ParsedAddress = { family: 4; value: number } | { family: 6; groups: number[] };

const IPV4_MAPPED_DOTTED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const EMBEDDED_IPV4_SUFFIX = /(\d{1,3}(?:\.\d{1,3}){3})$/;

/*
 * Removes the decorations tools print around an address: `[brackets]` and `%interface` zone
 * suffixes (`127.0.0.53%lo`, `[fe80::1]%enp3s0`, `[fe80::1%enp3s0]`).
 */
export function stripAddressDecorations(address: string): string {
  let stripped = address.trim().replace(/%[^\]]*/, "");
  if (stripped.startsWith("[") && stripped.endsWith("]")) {
    stripped = stripped.slice(1, -1);
  }
  return stripped;
}

/* Strips decorations, lowercases, and unwraps IPv4-mapped IPv6 (`::ffff:1.2.3.4` becomes `1.2.3.4`). */
export function normalizeIpAddress(address: string): string {
  const stripped = stripAddressDecorations(address).toLowerCase();
  const mapped = IPV4_MAPPED_DOTTED.exec(stripped);
  return mapped?.[1] ?? stripped;
}

export function parseIpv4(address: string): number | null {
  if (!isIPv4(address)) {
    return null;
  }
  return address.split(".").reduce((total, octet) => total * 256 + Number(octet), 0);
}

/* Expands an IPv6 address (including `::` compression and an embedded IPv4 tail) to eight groups. */
export function expandIpv6(address: string): number[] | null {
  if (!isIPv6(address)) {
    return null;
  }
  let text = address.toLowerCase();
  const embedded = EMBEDDED_IPV4_SUFFIX.exec(text)?.[1];
  if (embedded) {
    const value = parseIpv4(embedded);
    if (value === null) {
      return null;
    }
    const high = Math.floor(value / 65_536).toString(16);
    const low = (value % 65_536).toString(16);
    text = `${text.slice(0, -embedded.length)}${high}:${low}`;
  }
  const [head = "", tail] = text.split("::");
  const headGroups = head === "" ? [] : head.split(":");
  if (tail === undefined) {
    return headGroups.map((group) => Number.parseInt(group, 16));
  }
  const tailGroups = tail === "" ? [] : tail.split(":");
  const missingCount = 8 - headGroups.length - tailGroups.length;
  const zeroGroups = Array.from({ length: Math.max(0, missingCount) }, () => "0");
  return [...headGroups, ...zeroGroups, ...tailGroups].map((group) => Number.parseInt(group, 16));
}

function parseAddress(address: string): ParsedAddress | null {
  const normalized = normalizeIpAddress(address);
  const ipv4Value = parseIpv4(normalized);
  if (ipv4Value !== null) {
    return { family: 4, value: ipv4Value };
  }
  const groups = expandIpv6(normalized);
  if (!groups) {
    return null;
  }
  const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xff_ff;
  if (isMapped) {
    return { family: 4, value: (groups[6] ?? 0) * 65_536 + (groups[7] ?? 0) };
  }
  return { family: 6, groups };
}

function isInIpv4Range(value: number, base: string, prefixLength: number): boolean {
  const baseValue = parseIpv4(base) ?? 0;
  const blockSize = 2 ** (32 - prefixLength);
  return Math.floor(value / blockSize) === Math.floor(baseValue / blockSize);
}

function isInIpv6Range(groups: number[], base: string, prefixLength: number): boolean {
  const baseGroups = expandIpv6(base) ?? [];
  let remainingBits = prefixLength;
  for (let groupIndex = 0; groupIndex < 8 && remainingBits > 0; groupIndex += 1) {
    const bits = Math.min(16, remainingBits);
    const shift = 16 - bits;
    if ((groups[groupIndex] ?? 0) >> shift !== (baseGroups[groupIndex] ?? 0) >> shift) {
      return false;
    }
    remainingBits -= bits;
  }
  return true;
}

/* Tailscale assigns 100.64.0.0/10 (CGNAT space) and fd7a:115c:a1e0::/48. */
export function isTailnetAddress(address: string): boolean {
  const parsed = parseAddress(address);
  if (!parsed) {
    return false;
  }
  if (parsed.family === 4) {
    return isInIpv4Range(parsed.value, "100.64.0.0", 10);
  }
  return isInIpv6Range(parsed.groups, "fd7a:115c:a1e0::", 48);
}

/* 127.0.0.0/8, ::1 and the name `localhost`. */
export function isLoopbackAddress(address: string): boolean {
  if (stripAddressDecorations(address).toLowerCase() === "localhost") {
    return true;
  }
  const parsed = parseAddress(address);
  if (!parsed) {
    return false;
  }
  if (parsed.family === 4) {
    return isInIpv4Range(parsed.value, "127.0.0.0", 8);
  }
  return isInIpv6Range(parsed.groups, "::1", 128);
}

const LAN_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
];

const LAN_IPV6_RANGES: [string, number][] = [
  ["::", 128],
  ["::1", 128],
  ["fe80::", 10],
  ["fc00::", 7],
];

/*
 * Tags a login source address for the User Watcher. Tailnet ranges win over every other range
 * (fd7a:115c:a1e0::/48 sits inside the ULA block, and 100.64.0.0/10 is treated as tailnet even
 * though it is generic CGNAT space). RFC1918, loopback, link-local and ULA become `lan`. Anything
 * else, including strings that are not IP addresses at all, is `public`.
 */
export function classifyNetworkTag(address: string): NetworkTag {
  const parsed = parseAddress(address);
  if (!parsed) {
    return "public";
  }
  if (isTailnetAddress(address)) {
    return "tailnet";
  }
  const isLan =
    parsed.family === 4
      ? LAN_IPV4_RANGES.some(([base, prefixLength]) => isInIpv4Range(parsed.value, base, prefixLength))
      : LAN_IPV6_RANGES.some(([base, prefixLength]) => isInIpv6Range(parsed.groups, base, prefixLength));
  return isLan ? "lan" : "public";
}
