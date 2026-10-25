import { runCommand } from "@/collector/drivers/linux/run-command";
import { parseSystemctlShow, type SystemdUnitInformation } from "@/collector/parsers/parse-systemctl-show";
import type { DiscoveredItem } from "@/collector/types";

/*
 * Units that are never Lobby material: OS plumbing, ssh (shown in the User Watcher instead) and
 * ServerLab itself. Patterns ending in `*` match by prefix.
 */
const UNIT_DENYLIST = [
  "systemd-*", "dbus*", "getty@*", "serial-getty@*", "cron", "anacron", "atd", "polkit", "udisks2", "snapd*", "ssh", "sshd", "serverlab-*", "rsyslog", "irqbalance",
  "ModemManager", "multipathd", "networkd-dispatcher", "packagekit", "unattended-upgrades", "upower", "user@*", "user-runtime-dir@*", "accounts-daemon", "thermald", "fwupd",
  "wpa_supplicant", "NetworkManager", "avahi-daemon", "cups*", "apparmor", "blk-availability", "lvm2-*", "mdmonitor", "open-iscsi", "iscsid", "lxd-agent", "qemu-guest-agent",
  "open-vm-tools", "vgauth", "rtkit-daemon", "colord", "kerneloops", "power-profiles-daemon", "switcheroo-control", "secureboot-db", "finalrd", "console-setup", "keyboard-setup",
  "setvtrgb", "plymouth*", "ufw", "apport", "e2scrub_reap", "grub-*", "kmod-static-nodes", "dmesg", "uuidd", "fail2ban", "chrony", "ntp", "postfix*", "containerd",
];

export function isDeniedUnit(unitName: string): boolean {
  const baseName = unitName.replace(/\.service$/, "");
  return UNIT_DENYLIST.some((pattern) => (pattern.endsWith("*") ? baseName.startsWith(pattern.slice(0, -1)) : baseName === pattern));
}

async function listServiceUnits(): Promise<string[]> {
  const output = await runCommand("systemctl", ["list-units", "--type=service", "--state=running,failed,activating", "--plain", "--no-legend", "--no-pager"]);
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0] ?? "")
    .filter((unitName) => unitName.endsWith(".service"));
}

/**
 * Reads the running, failed and starting services (minus the denylist) with their description,
 * state, start time, main PID and cgroup path.
 */
export async function readSystemdUnits(): Promise<SystemdUnitInformation[]> {
  const unitNames = (await listServiceUnits()).filter((unitName) => !isDeniedUnit(unitName));
  if (unitNames.length === 0) return [];
  const output = await runCommand("systemctl", ["show", "--timestamp=unix", "--no-pager", "-p", "Id,Description,ActiveState,ActiveEnterTimestamp,MainPID,ControlGroup", ...unitNames]);
  return output ? parseSystemctlShow(output) : [];
}

/**
 * Converts units to Lobby items. Ports and bind scope are filled in later from the listeners.
 */
export function toSystemdItems(units: readonly SystemdUnitInformation[]): DiscoveredItem[] {
  return units.map((unit) => ({
    key: `systemd:${unit.unit}`,
    source: "systemd",
    rawName: unit.unit.replace(/\.service$/, ""),
    image: null,
    unit: unit.unit,
    processName: null,
    description: unit.description || null,
    ports: [],
    labels: {},
    state: unit.state,
    health: "none",
    startedAt: unit.state === "running" ? unit.startedAt : null,
    bindScope: "local",
    extra: { mainProcessId: unit.mainProcessId, controlGroup: unit.controlGroup },
  }));
}
