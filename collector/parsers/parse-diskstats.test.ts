import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { isWholePhysicalDisk, parseDiskstats } from "./parse-diskstats";

describe("parseDiskstats", () => {
  const counters = parseDiskstats(readFixture("proc-diskstats-ubuntu-24.04.txt"));

  test("keeps only whole physical disks", () => {
    expect(counters.map((counter) => counter.deviceName)).toEqual(["nvme0n1", "sda", "sdb", "mmcblk0"]);
  });

  test("converts 512-byte sectors to bytes", () => {
    expect(counters[0]).toEqual({ deviceName: "nvme0n1", readBytes: 98_234_512 * 512, writtenBytes: 187_234_560 * 512 });
  });
});

describe("isWholePhysicalDisk", () => {
  test.each([
    ["sda", true],
    ["sdab", true],
    ["vdb", true],
    ["xvda", true],
    ["nvme1n2", true],
    ["mmcblk1", true],
    ["sda1", false],
    ["nvme0n1p3", false],
    ["mmcblk0p1", false],
    ["dm-0", false],
    ["loop3", false],
    ["zram0", false],
    ["md127", false],
    ["sr0", false],
  ])("%s → %s", (deviceName, expected) => {
    expect(isWholePhysicalDisk(deviceName)).toBe(expected);
  });
});
