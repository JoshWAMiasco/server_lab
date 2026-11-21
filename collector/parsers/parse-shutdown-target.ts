import type { BootEndKind } from "@/collector/types";

/*
 * Tells a reboot from a power-off. Two sources:
 *  - `systemctl list-jobs --no-legend --plain` while the collector is being stopped: during a
 *    shutdown systemd has a start job queued for reboot.target (or kexec/soft-reboot) or for
 *    poweroff.target / halt.target. A plain `systemctl stop|restart` has neither.
 *  - `journalctl -b -1 -o cat` on the next boot, when the collector could not record it: the last
 *    shutdown messages of the previous boot ("Reached target reboot.target - System Reboot.").
 */

export type ShutdownKind = Exclude<BootEndKind, "crash">;

const REBOOT_UNITS = new Set(["reboot.target", "kexec.target", "soft-reboot.target", "systemd-reboot.service", "systemd-kexec.service", "systemd-soft-reboot.service"]);
const SHUTDOWN_UNITS = new Set(["poweroff.target", "halt.target", "systemd-poweroff.service", "systemd-halt.service"]);

/** The queued job list → "reboot", "shutdown" or null (a service stop or restart, not a host shutdown). */
export function parseShutdownJobs(text: string): ShutdownKind | null {
  let kind: ShutdownKind | null = null;
  for (const line of text.split("\n")) {
    const columns = line.trim().split(/\s+/);
    const unit = /^\d+$/.test(columns[0] ?? "") ? columns[1] : columns[0];
    if (!unit) continue;
    if (REBOOT_UNITS.has(unit)) return "reboot";
    if (SHUTDOWN_UNITS.has(unit)) kind = "shutdown";
  }
  return kind;
}

const REBOOT_MESSAGES: readonly RegExp[] = [
  /^Reached target (?:reboot|kexec|soft-reboot)\.target\b/,
  /^Reached target (?:System Reboot|Reboot via kexec|Reboot System Userspace)\.?$/,
  /^Finished systemd-(?:reboot|kexec|soft-reboot)\.service\b/,
  /^Finished (?:System Reboot|Reboot via kexec)\.?$/,
  /^Rebooting(?: with kexec)?\.?$/,
  /^System is rebooting(?: with kexec)?\.?$/,
  /^The system will reboot now!?$/,
  /^Successfully soft-rebooted\b/,
];

const SHUTDOWN_MESSAGES: readonly RegExp[] = [
  /^Reached target (?:poweroff|halt)\.target\b/,
  /^Reached target (?:System Power Off|Power-Off|System Halt|Halt)\.?$/,
  /^Finished systemd-(?:poweroff|halt)\.service\b/,
  /^Finished (?:System Power Off|Power-Off|System Halt|Halt)\.?$/,
  /^Powering off\.?$/,
  /^Halting system\.?$/,
  /^System is (?:powering down|halting)\.?$/,
  /^The system will (?:power off|halt) now!?$/,
];

/**
 * The previous boot's journal tail → how it ended. The last matching line wins, so an early
 * "System is rebooting." followed by the later shutdown targets reads consistently; a boot that
 * ends without any of these messages (power loss, kernel panic) is null.
 */
export function parsePreviousBootEnd(journalText: string): ShutdownKind | null {
  const lines = journalText.split("\n");
  for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex]?.trim() ?? "";
    if (line === "") continue;
    if (REBOOT_MESSAGES.some((pattern) => pattern.test(line))) return "reboot";
    if (SHUTDOWN_MESSAGES.some((pattern) => pattern.test(line))) return "shutdown";
  }
  return null;
}
