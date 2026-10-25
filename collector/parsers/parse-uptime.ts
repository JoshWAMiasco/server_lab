/* Parses /proc/uptime (`1043567.21 4012345.67`): seconds since boot, the first field. Returns 0 if unreadable. */
export function parseUptime(text: string): number {
  const value = Number(text.trim().split(/\s+/)[0]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
