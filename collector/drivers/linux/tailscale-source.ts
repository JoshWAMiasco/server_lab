import { runCommand } from "@/collector/drivers/linux/run-command";

interface TailscaleStatus {
  Self?: { DNSName?: string; HostName?: string; TailscaleIPs?: string[]; PeerAPIURL?: string[] };
  Peer?: Record<string, { DNSName?: string; HostName?: string; TailscaleIPs?: string[] }>;
}

/**
 * `tailscale status --json`, or null when Tailscale is not installed or not running.
 */
export async function readTailscaleStatus(): Promise<TailscaleStatus | null> {
  const output = await runCommand("tailscale", ["status", "--json"], 5000);
  if (!output) return null;
  try {
    return JSON.parse(output) as TailscaleStatus;
  } catch {
    return null;
  }
}

/**
 * Tailnet device names by Tailscale IP (both IPv4 and IPv6), for tagging logins.
 */
export function mapTailnetDevices(status: TailscaleStatus | null): Map<string, string> {
  const devices = new Map<string, string>();
  for (const peer of [status?.Self, ...Object.values(status?.Peer ?? {})]) {
    if (!peer) continue;
    const deviceName = peer.HostName || peer.DNSName?.split(".")[0] || "unknown";
    for (const ipAddress of peer.TailscaleIPs ?? []) devices.set(ipAddress, deviceName);
  }
  return devices;
}

/**
 * This machine's MagicDNS name without the trailing dot, or null.
 */
export function readMagicDnsName(status: TailscaleStatus | null): string | null {
  return status?.Self?.DNSName?.replace(/\.$/, "") || null;
}

/**
 * Ports of tailscaled's PeerAPI listeners (one per Tailscale address, random on each start), so the
 * Lobby can attribute them to tailscaled instead of showing them as unnamed ports.
 */
export function readPeerApiPorts(status: TailscaleStatus | null): number[] {
  const ports: number[] = [];
  for (const peerApiUrl of status?.Self?.PeerAPIURL ?? []) {
    if (!URL.canParse(peerApiUrl)) continue;
    const port = Number(new URL(peerApiUrl).port);
    if (Number.isInteger(port) && port > 0) ports.push(port);
  }
  return ports;
}
