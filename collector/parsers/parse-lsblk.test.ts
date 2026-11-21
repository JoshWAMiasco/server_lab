import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { classifyStorageKind, parseLsblk } from "./parse-lsblk";

describe("parseLsblk", () => {
  test("keeps physical disks only and classifies them (util-linux 2.39, real JSON types)", () => {
    const storage = parseLsblk(readFixture("lsblk-disks-ubuntu-24.04.json"));
    expect(storage.map((device) => [device.name, device.kind])).toEqual([
      ["sda", "ssd"],
      ["sdb", "hdd"],
      ["sdc", "usb"],
      ["nvme0n1", "nvme"],
    ]);
    expect(storage[0]).toEqual({
      name: "sda",
      model: "Samsung SSD 870 EVO 1TB",
      vendor: "ATA",
      serialNumber: "S6PTNZ0T123456A",
      sizeBytes: 1_000_204_886_016,
      kind: "ssd",
      transport: "sata",
      revision: "SVT02B6Q",
    });
    expect(storage[2]).toMatchObject({ model: "Extreme Pro", vendor: "SanDisk" });
    expect(storage[3]).toMatchObject({ vendor: null, sizeBytes: 2_000_398_934_016 });
  });

  test("reads string numbers and booleans (util-linux 2.37)", () => {
    const storage = parseLsblk(readFixture("lsblk-disks-ubuntu-22.04.json"));
    expect(storage).toEqual([
      { name: "sda", model: "ST2000DM008-2FR102", vendor: "ATA", serialNumber: "ZFL1ABCD", sizeBytes: 2_000_398_934_016, kind: "hdd", transport: "sata", revision: "0001" },
      { name: "vda", model: null, vendor: "0x1af4", serialNumber: null, sizeBytes: 53_687_091_200, kind: "hdd", transport: null, revision: null },
    ]);
  });

  test("returns [] for invalid input", () => {
    expect(parseLsblk("")).toEqual([]);
    expect(parseLsblk("{}")).toEqual([]);
  });
});

describe("classifyStorageKind", () => {
  test.each([
    ["nvme", false, "nvme"],
    ["usb", true, "usb"],
    ["sata", false, "ssd"],
    ["sas", true, "hdd"],
    [null, null, "other"],
  ] as const)("%s rotational=%s → %s", (transport, isRotational, kind) => {
    expect(classifyStorageKind(transport, isRotational)).toBe(kind);
  });
});
