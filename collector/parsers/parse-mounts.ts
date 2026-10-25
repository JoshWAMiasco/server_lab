import type { MountEntry } from "../types";

const PSEUDO_FILESYSTEMS = new Set([
  "autofs",
  "binfmt_misc",
  "bpf",
  "configfs",
  "debugfs",
  "devpts",
  "devtmpfs",
  "efivarfs",
  "fuse.gvfsd-fuse",
  "fuse.lxcfs",
  "fuse.portal",
  "fuse.snapfuse",
  "fusectl",
  "hugetlbfs",
  "mqueue",
  "nfsd",
  "nsfs",
  "overlay",
  "proc",
  "pstore",
  "ramfs",
  "rpc_pipefs",
  "securityfs",
  "selinuxfs",
  "squashfs",
  "sysfs",
  "tmpfs",
  "tracefs",
]);

export function isPseudoFilesystem(filesystemType: string): boolean {
  return PSEUDO_FILESYSTEMS.has(filesystemType) || filesystemType.startsWith("cgroup");
}

/* The kernel escapes space, tab, newline and backslash in /proc/mounts as three-digit octal (`\040`). */
export function decodeMountField(field: string): string {
  return field.replaceAll(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
}

/*
 * Parses /proc/mounts (or /proc/self/mounts) into real filesystems worth a usage bar. A device
 * mounted several times (bind mounts, btrfs subvolumes) is listed once, at its shortest mount
 * point, keeping the position where the device first appeared.
 */
export function parseMounts(text: string): MountEntry[] {
  const byDevice = new Map<string, MountEntry>();
  for (const line of text.split("\n")) {
    const [rawDevice, rawMountPoint, filesystemType] = line.trim().split(/\s+/);
    if (!rawDevice || !rawMountPoint || !filesystemType || isPseudoFilesystem(filesystemType)) {
      continue;
    }
    const entry: MountEntry = {
      device: decodeMountField(rawDevice),
      mountPoint: decodeMountField(rawMountPoint),
      filesystemType,
    };
    const existing = byDevice.get(entry.device);
    if (!existing || entry.mountPoint.length < existing.mountPoint.length) {
      byDevice.set(entry.device, entry);
    }
  }
  return [...byDevice.values()];
}
