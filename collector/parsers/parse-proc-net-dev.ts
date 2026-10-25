import type { NetworkInterfaceCounters } from "../types";

/*
 * /proc/net/dev: two header lines, then `name: rx_bytes rx_packets … (8 receive columns) tx_bytes …`.
 * Older kernels print no space after the colon, so the line is split on the colon first.
 */
const RECEIVED_BYTES_COLUMN = 0;
const TRANSMITTED_BYTES_COLUMN = 8;

export function parseProcNetDevice(text: string): NetworkInterfaceCounters[] {
  const counters: NetworkInterfaceCounters[] = [];
  for (const line of text.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1 || line.includes("|")) {
      continue;
    }
    const interfaceName = line.slice(0, colonIndex).trim();
    const fields = line
      .slice(colonIndex + 1)
      .trim()
      .split(/\s+/);
    if (!interfaceName || fields.length <= TRANSMITTED_BYTES_COLUMN) {
      continue;
    }
    const receivedBytes = Number(fields[RECEIVED_BYTES_COLUMN]);
    const transmittedBytes = Number(fields[TRANSMITTED_BYTES_COLUMN]);
    if (!Number.isFinite(receivedBytes) || !Number.isFinite(transmittedBytes)) {
      continue;
    }
    counters.push({ interfaceName, receivedBytes, transmittedBytes });
  }
  return counters;
}

const DEFAULT_EXCLUDED_PATTERNS = ["lo", "docker*", "veth*", "br-*", "virbr*"];
const TAILSCALE_INTERFACE = "tailscale0";

function matchesPattern(interfaceName: string, pattern: string): boolean {
  return pattern.endsWith("*") ? interfaceName.startsWith(pattern.slice(0, -1)) : interfaceName === pattern;
}

/*
 * True for interfaces worth charting: not loopback, Docker bridges/veths, libvirt bridges or
 * tailscale0. `extraExcluded` accepts exact names or `prefix*` patterns. tailscale0 is excluded
 * unless `includeTailscale` is set (the Resources page shows it behind a toggle).
 */
export function isPhysicalInterface(
  interfaceName: string,
  extraExcluded: readonly string[] = [],
  includeTailscale = false,
): boolean {
  if (interfaceName === TAILSCALE_INTERFACE && !includeTailscale) {
    return false;
  }
  return ![...DEFAULT_EXCLUDED_PATTERNS, ...extraExcluded].some((pattern) => matchesPattern(interfaceName, pattern));
}
