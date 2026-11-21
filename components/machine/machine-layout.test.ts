import { describe, expect, it } from "vitest";
import type { GpuDevice, MachineInventory, MemoryModule, StorageDevice } from "@/collector/types";
import type { FilesystemUsageRecord } from "@/lib/queries/history-queries";
import {
  assignFilesystemsToDisks,
  buildMachineDescription,
  buildMachineModel,
  buildMemorySlots,
  distributeAlong,
  formatClockSpeed,
  formatLinkSpeed,
  isIntegratedGpu,
  isPartitionOf,
  limitVisible,
  readCardElementId,
  readCardIdentifier,
  readShortProcessorName,
  summarizeMemory,
} from "@/components/machine/machine-layout";

const GIGABYTE = 1024 ** 3;

function createModule(slot: string, sizeBytes: number | null): MemoryModule {
  return {
    slot,
    bank: null,
    sizeBytes,
    type: sizeBytes ? "DDR5" : null,
    formFactor: "DIMM",
    speedMegatransfers: sizeBytes ? 5600 : null,
    configuredSpeedMegatransfers: sizeBytes ? 5200 : null,
    manufacturer: null,
    partNumber: null,
    serialNumber: null,
  };
}

function createDisk(name: string, kind: StorageDevice["kind"]): StorageDevice {
  return {
    name,
    model: null,
    vendor: null,
    serialNumber: null,
    sizeBytes: 512 * GIGABYTE,
    kind,
    transport: null,
    revision: null,
  };
}

function createGpu(index: number, vendor: GpuDevice["vendor"], name: string): GpuDevice {
  return { index, pciAddress: `0000:0${index}:00.0`, vendor, name, driver: null, statsAvailable: true };
}

function createFilesystem(mountPoint: string, device: string): FilesystemUsageRecord {
  return { mountPoint, device, filesystemType: "ext4", usedBytes: 1, sizeBytes: 2 } as FilesystemUsageRecord;
}

const INVENTORY: MachineInventory = {
  formFactor: "mini",
  chassisDescription: "Mini PC",
  system: { vendor: "LENOVO", product: "ThinkCentre M75q Gen 2", version: null, serialNumber: null },
  motherboard: { vendor: "LENOVO", model: "3156", version: null, serialNumber: null },
  bios: { vendor: null, version: null, releaseDate: null },
  operatingSystem: { name: "Ubuntu 24.04 LTS", kernel: "6.8.0-45-generic", architecture: "x86_64" },
  processors: [],
  memory: {
    source: "dmidecode",
    slotCount: 2,
    maximumCapacityBytes: 64 * GIGABYTE,
    modules: [createModule("DIMM 0", 16 * GIGABYTE), createModule("DIMM 1", null)],
  },
  storage: [createDisk("nvme0n1", "nvme"), createDisk("sda", "hdd"), createDisk("sdb", "usb")],
  networkAdapters: [],
  hasHardwareInventoryFile: true,
};

describe("buildMemorySlots", () => {
  it("keeps the reported slot count and marks empty slots", () => {
    const slots = buildMemorySlots(INVENTORY.memory, "mini");
    expect(slots.map((slot) => [slot.slotLabel, slot.memoryModule?.sizeBytes ?? null])).toEqual([
      ["DIMM 0", 16 * GIGABYTE],
      ["DIMM 1", null],
    ]);
  });

  it("pads to slotCount and falls back to the module count, then the form factor default", () => {
    expect(
      buildMemorySlots(
        { source: "dmidecode", slotCount: 4, maximumCapacityBytes: null, modules: [createModule("A1", GIGABYTE)] },
        "desktop",
      ),
    ).toHaveLength(4);
    expect(
      buildMemorySlots(
        {
          source: "edac",
          slotCount: null,
          maximumCapacityBytes: null,
          modules: [createModule("A1", GIGABYTE), createModule("A2", GIGABYTE), createModule("B1", GIGABYTE)],
        },
        "laptop",
      ),
    ).toHaveLength(3);
    expect(
      buildMemorySlots({ source: "none", slotCount: null, maximumCapacityBytes: null, modules: [] }, "server"),
    ).toHaveLength(8);
  });
});

describe("buildMachineModel", () => {
  it("splits GPUs and disks into the groups the illustration draws", () => {
    const model = buildMachineModel(INVENTORY, [
      createGpu(0, "intel", "Intel UHD Graphics 770"),
      createGpu(1, "nvidia", "GeForce RTX 3060"),
      createGpu(2, "intel", "Intel Arc A770"),
    ]);
    expect(model.integratedGpus.map((gpu) => gpu.index)).toEqual([0]);
    expect(model.discreteGpus.map((gpu) => gpu.index)).toEqual([1, 2]);
    expect(model.solidStateSticks.map((disk) => disk.name)).toEqual(["nvme0n1"]);
    expect(model.driveBays.map((disk) => disk.name)).toEqual(["sda"]);
    expect(model.externalDrives.map((disk) => disk.name)).toEqual(["sdb"]);
  });

  it("treats only non-Arc Intel GPUs as integrated", () => {
    expect(isIntegratedGpu({ vendor: "intel", name: "Intel Arc Graphics" })).toBe(true);
    expect(isIntegratedGpu({ vendor: "intel", name: "Intel Arc B580" })).toBe(false);
    expect(isIntegratedGpu({ vendor: "amd", name: "Radeon Vega" })).toBe(false);
  });
});

describe("distributeAlong", () => {
  it("centres items that fit", () => {
    expect(distributeAlong({ count: 3, start: 0, length: 100, preferredSize: 20, gap: 10 })).toEqual({
      offsets: [10, 40, 70],
      size: 20,
    });
  });

  it("shrinks items so the row never overflows", () => {
    const { offsets, size } = distributeAlong({ count: 8, start: 10, length: 100, preferredSize: 20, gap: 5 });
    expect(size).toBeLessThan(20);
    expect(offsets[0]).toBeCloseTo(10);
    expect(offsets.at(-1)! + size).toBeCloseTo(110);
  });

  it("returns nothing for zero items", () => {
    expect(distributeAlong({ count: 0, start: 0, length: 100, preferredSize: 20, gap: 5 }).offsets).toEqual([]);
  });
});

describe("limitVisible", () => {
  it("counts the hidden items", () => {
    expect(limitVisible([1, 2, 3, 4, 5], 3)).toEqual({ visible: [1, 2, 3], hiddenCount: 2 });
    expect(limitVisible([1], 3)).toEqual({ visible: [1], hiddenCount: 0 });
  });
});

describe("readShortProcessorName", () => {
  it.each([
    ["Intel(R) Xeon(R) Silver 4210 CPU @ 2.20GHz", "Xeon Silver 4210"],
    ["AMD Ryzen 7 PRO 5750GE with Radeon Graphics", "Ryzen 7 PRO 5750GE"],
    ["12th Gen Intel(R) Core(TM) i7-12700K", "12th Gen Intel Core i7-12700K"],
    ["AMD EPYC 7543 32-Core Processor", "EPYC 7543"],
  ])("%s → %s", (model, expected) => {
    expect(readShortProcessorName(model)).toBe(expected);
  });
});

describe("isPartitionOf and assignFilesystemsToDisks", () => {
  it("matches partitions of the right disk only", () => {
    expect(isPartitionOf("/dev/nvme0n1p2", "nvme0n1")).toBe(true);
    expect(isPartitionOf("/dev/nvme0n10", "nvme0n1")).toBe(false);
    expect(isPartitionOf("/dev/sda1", "sda")).toBe(true);
    expect(isPartitionOf("/dev/sdaa1", "sda")).toBe(false);
    expect(isPartitionOf("/dev/sdb", "sdb")).toBe(true);
  });

  it("groups mounts by disk and keeps the rest unassigned", () => {
    const { byDisk, unassigned } = assignFilesystemsToDisks(INVENTORY.storage, [
      createFilesystem("/", "/dev/nvme0n1p2"),
      createFilesystem("/data", "/dev/sda1"),
      createFilesystem("/srv", "/dev/mapper/vg-srv"),
    ]);
    expect(byDisk.get("nvme0n1")?.map((filesystem) => filesystem.mountPoint)).toEqual(["/"]);
    expect(byDisk.get("sda")?.map((filesystem) => filesystem.mountPoint)).toEqual(["/data"]);
    expect(byDisk.get("sdb")).toEqual([]);
    expect(unassigned.map((filesystem) => filesystem.mountPoint)).toEqual(["/srv"]);
  });
});

describe("summaries and identifiers", () => {
  it("summarizes the installed memory", () => {
    const slots = buildMemorySlots(INVENTORY.memory, "mini");
    expect(summarizeMemory(slots, (byteCount) => `${byteCount / GIGABYTE} GB`)).toBe(
      "1 of 2 slots · 16 GB DDR5 @ 5200 MT/s",
    );
  });

  it("builds the page description", () => {
    expect(buildMachineDescription(INVENTORY)).toBe(
      "LENOVO ThinkCentre M75q Gen 2 · Mini PC · Ubuntu 24.04 LTS · kernel 6.8",
    );
  });

  it("maps every memory slot to the memory card", () => {
    expect(readCardIdentifier("memory-slot-3")).toBe("memory");
    expect(readCardIdentifier("storage-sda")).toBe("storage-sda");
    expect(readCardElementId("network-wlp2s0.1")).toBe("machine-part-network-wlp2s0_1");
  });
});

describe("formatLinkSpeed and formatClockSpeed", () => {
  it("formats speeds", () => {
    expect(formatLinkSpeed(2500)).toBe("2.5 Gb/s");
    expect(formatLinkSpeed(10_000)).toBe("10 Gb/s");
    expect(formatLinkSpeed(100)).toBe("100 Mb/s");
    expect(formatClockSpeed(3600)).toBe("3.60 GHz");
  });
});
