/*
 * The boot time from /proc/stat's `btime` line (seconds since the epoch), as epoch milliseconds.
 * Unlike now − /proc/uptime it does not drift between reads, so the same boot always gets the
 * same bootedAt. Returns null when the line is missing.
 */
export function parseBootTime(procStatText: string): number | null {
  const match = /^btime\s+(\d+)\s*$/m.exec(procStatText);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}
