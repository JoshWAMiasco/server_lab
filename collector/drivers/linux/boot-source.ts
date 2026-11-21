import { readTextFile, runCommand } from "@/collector/drivers/linux/run-command";
import { parseBootTime } from "@/collector/parsers/parse-boot-time";
import { parsePreviousBootEnd, parseShutdownJobs, type ShutdownKind } from "@/collector/parsers/parse-shutdown-target";
import { parseUptime } from "@/collector/parsers/parse-uptime";
import type { BootIdentity } from "@/collector/types";

/*
 * Boot identity and how boots end, for the uptime streak. The collector runs unprivileged:
 * `systemctl list-jobs` works over D-Bus for any user, and `journalctl -b -1` needs the
 * systemd-journal group (set by install.sh's groups drop-in).
 */

const BOOT_ID_PATH = "/proc/sys/kernel/random/boot_id";
const SHUTDOWN_JOBS_TIMEOUT_MILLISECONDS = 1500;
const PREVIOUS_BOOT_TIMEOUT_MILLISECONDS = 5000;

/**
 * The kernel's per-boot random id and the boot time. bootedAt comes from /proc/stat's btime
 * (stable across reads), falling back to now − /proc/uptime rounded to the second.
 */
export async function readBootIdentity(): Promise<BootIdentity> {
  const [bootIdText, statText, uptimeText] = await Promise.all([readTextFile(BOOT_ID_PATH), readTextFile("/proc/stat"), readTextFile("/proc/uptime")]);
  const bootedAt = parseBootTime(statText ?? "") ?? Math.round((Date.now() - parseUptime(uptimeText ?? "") * 1000) / 1000) * 1000;
  const bootId = bootIdText?.trim() ?? "";
  return { bootId: bootId === "" ? `boot-${bootedAt}` : bootId, bootedAt };
}

/** On SIGTERM: whether systemd has a reboot or power-off queued. Null for a plain service stop, or on any failure. */
export async function readShutdownIntent(): Promise<ShutdownKind | null> {
  const output = await runCommand("systemctl", ["list-jobs", "--no-legend", "--plain"], SHUTDOWN_JOBS_TIMEOUT_MILLISECONDS);
  return output === null ? null : parseShutdownJobs(output);
}

/** After an unrecorded end: the previous boot's last journal lines. Null when there is no previous boot or no access. */
export async function readPreviousBootEnd(): Promise<ShutdownKind | null> {
  const output = await runCommand("journalctl", ["-b", "-1", "-o", "cat", "-n", "400", "--no-pager"], PREVIOUS_BOOT_TIMEOUT_MILLISECONDS);
  return output === null ? null : parsePreviousBootEnd(output);
}
