import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { decodeMountField, isPseudoFilesystem, parseMounts } from "./parse-mounts";

describe("parseMounts", () => {
  const mounts = parseMounts(readFixture("proc-mounts-ubuntu-24.04.txt"));

  test("keeps real filesystems and drops pseudo, snap, Docker and lxcfs mounts", () => {
    expect(mounts).toEqual([
      { device: "/dev/mapper/ubuntu--vg-ubuntu--lv", mountPoint: "/", filesystemType: "ext4" },
      { device: "/dev/nvme0n1p2", mountPoint: "/boot", filesystemType: "ext4" },
      { device: "/dev/nvme0n1p1", mountPoint: "/boot/efi", filesystemType: "vfat" },
      { device: "/dev/sda1", mountPoint: "/mnt/media", filesystemType: "ext4" },
      { device: "/dev/sdb1", mountPoint: "/mnt/old photos", filesystemType: "btrfs" },
      { device: "//nas.home.arpa/backups", mountPoint: "/mnt/nas", filesystemType: "cifs" },
    ]);
  });

  test("keeps the shortest mount point of a device mounted twice", () => {
    const sda = mounts.filter((mount) => mount.device === "/dev/sda1");
    expect(sda).toHaveLength(1);
    expect(sda[0]?.mountPoint).toBe("/mnt/media");
  });
});

describe("decodeMountField", () => {
  test("decodes octal escapes for space, tab, newline and backslash", () => {
    expect(decodeMountField(String.raw`/mnt/a\040b\011c\012d\134e`)).toBe("/mnt/a b\tc\nd\\e");
  });
});

describe("isPseudoFilesystem", () => {
  test.each(["cgroup", "cgroup2", "fuse.snapfuse", "tmpfs", "overlay"])("%s is pseudo", (filesystemType) => {
    expect(isPseudoFilesystem(filesystemType)).toBe(true);
  });

  test.each(["ext4", "xfs", "btrfs", "zfs", "vfat", "nfs4", "cifs", "fuseblk"])("%s is real", (filesystemType) => {
    expect(isPseudoFilesystem(filesystemType)).toBe(false);
  });
});
