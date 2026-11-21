import type {
  GpuDevice,
  MachineFormFactor,
  MachineInventory,
  MemoryInventory,
  MemoryModule,
  StorageDevice,
} from "@/collector/types";
import type { FilesystemUsageRecord } from "@/lib/queries/history-queries";

/*
 * Pure helpers behind the Machine page: turning the hardware inventory into the parts the
 * illustration draws (one socket per processor, one slot per memory slot, one card per discrete
 * GPU, one stick or bay per disk) and placing a variable number of them inside a fixed area.
 */

export interface PartBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MemorySlot {
  slotIndex: number;
  /** The board label ("DIMM_A1"), when reported. */
  slotLabel: string | null;
  /** null for an empty slot. */
  memoryModule: MemoryModule | null;
}

export interface MachineModel {
  memorySlots: MemorySlot[];
  /** NVIDIA, AMD and discrete Intel Arc cards, drawn as PCIe cards (or chips on laptops). */
  discreteGpus: GpuDevice[];
  /** Intel GPUs built into the processor, drawn on the CPU. */
  integratedGpus: GpuDevice[];
  /** NVMe drives, drawn as M.2 sticks. */
  solidStateSticks: StorageDevice[];
  /** SATA/SAS SSDs, hard disks and other internal disks, drawn in drive bays. */
  driveBays: StorageDevice[];
  /** USB disks, drawn as external drives. */
  externalDrives: StorageDevice[];
}

const DEFAULT_SLOT_COUNTS: Record<MachineFormFactor, number> = {
  desktop: 4,
  laptop: 2,
  mini: 2,
  server: 8,
  "all-in-one": 2,
  unknown: 4,
};

const FORM_FACTOR_LABELS: Record<MachineFormFactor, string> = {
  desktop: "Desktop",
  laptop: "Laptop",
  mini: "Mini PC",
  server: "Rack server",
  "all-in-one": "All-in-one",
  unknown: "Computer",
};

/**
 * A readable name for a form factor.
 *
 * @example
 * readFormFactorLabel("mini"); // "Mini PC"
 */
export function readFormFactorLabel(formFactor: MachineFormFactor): string {
  return FORM_FACTOR_LABELS[formFactor];
}

/**
 * Every physical memory slot, filled or empty: `slotCount` when the host reports it, otherwise the
 * number of modules, otherwise a typical count for the form factor. Filled slots keep their module.
 *
 * @example
 * buildMemorySlots({ source: "none", slotCount: 4, maximumCapacityBytes: null, modules: [moduleA1] }, "desktop").length; // 4
 */
export function buildMemorySlots(memory: MemoryInventory, formFactor: MachineFormFactor): MemorySlot[] {
  const slotCount = Math.max(memory.slotCount ?? 0, memory.modules.length) || DEFAULT_SLOT_COUNTS[formFactor];
  return Array.from({ length: slotCount }, (_, slotIndex) => {
    const memoryModule = memory.modules[slotIndex];
    return {
      slotIndex,
      slotLabel: memoryModule?.slot ?? null,
      memoryModule: memoryModule && memoryModule.sizeBytes !== null ? memoryModule : null,
    };
  });
}

/**
 * Whether a GPU is built into the processor. Intel GPUs are integrated unless the name is a
 * discrete Arc card (A3xx–A7xx, B5xx…).
 *
 * @example
 * isIntegratedGpu({ vendor: "intel", name: "Intel UHD Graphics 770" }); // true
 * isIntegratedGpu({ vendor: "intel", name: "Intel Arc A770" }); // false
 */
export function isIntegratedGpu(gpu: Pick<GpuDevice, "vendor" | "name">): boolean {
  return gpu.vendor === "intel" && !/\bArc\s+[AB]\d{3}/i.test(gpu.name);
}

/**
 * Sorts the inventory into the groups each illustration draws.
 *
 * @example
 * const model = buildMachineModel(inventory, gpus);
 * model.discreteGpus.length; // 2
 */
export function buildMachineModel(inventory: MachineInventory, gpus: readonly GpuDevice[]): MachineModel {
  return {
    memorySlots: buildMemorySlots(inventory.memory, inventory.formFactor),
    discreteGpus: gpus.filter((gpu) => !isIntegratedGpu(gpu)),
    integratedGpus: gpus.filter((gpu) => isIntegratedGpu(gpu)),
    solidStateSticks: inventory.storage.filter((device) => device.kind === "nvme"),
    driveBays: inventory.storage.filter(
      (device) => device.kind === "ssd" || device.kind === "hdd" || device.kind === "other",
    ),
    externalDrives: inventory.storage.filter((device) => device.kind === "usb"),
  };
}

/**
 * Spreads `count` items along one axis inside `[start, start + length]`. Items keep
 * `preferredSize` and `gap` when they fit; otherwise both shrink so the row never overflows.
 * A short row is centred.
 *
 * @example
 * distributeAlong({ count: 3, start: 0, length: 100, preferredSize: 20, gap: 10 });
 * // { offsets: [10, 40, 70], size: 20 }
 */
export function distributeAlong({
  count,
  start,
  length,
  preferredSize,
  gap,
}: {
  count: number;
  start: number;
  length: number;
  preferredSize: number;
  gap: number;
}): { offsets: number[]; size: number } {
  if (count <= 0) return { offsets: [], size: preferredSize };
  const naturalLength = count * preferredSize + (count - 1) * gap;
  const scale = naturalLength > length ? length / naturalLength : 1;
  const size = preferredSize * scale;
  const scaledGap = gap * scale;
  const usedLength = count * size + (count - 1) * scaledGap;
  const firstOffset = start + (length - usedLength) / 2;
  return { offsets: Array.from({ length: count }, (_, index) => firstOffset + index * (size + scaledGap)), size };
}

/**
 * The first `limit` items, and how many were left out (the illustration draws "+N" for them).
 *
 * @example
 * limitVisible([1, 2, 3, 4], 3); // { visible: [1, 2, 3], hiddenCount: 1 }
 */
export function limitVisible<Item>(items: readonly Item[], limit: number): { visible: Item[]; hiddenCount: number } {
  return { visible: items.slice(0, limit), hiddenCount: Math.max(0, items.length - limit) };
}

/**
 * A processor model without trademarks, clock speed and vendor prefix, short enough for a socket.
 *
 * @example
 * readShortProcessorName("Intel(R) Xeon(R) Silver 4210 CPU @ 2.20GHz"); // "Xeon Silver 4210"
 * readShortProcessorName("AMD Ryzen 7 PRO 5750GE with Radeon Graphics"); // "Ryzen 7 PRO 5750GE"
 */
export function readShortProcessorName(model: string): string {
  const shortName = model
    .replaceAll(/\((R|TM|C)\)/gi, "")
    .replace(/@.*$/, "")
    .replace(/\bwith\b.*$/i, "")
    .replaceAll(/\b(CPU|Processor|\d+-Core)\b/gi, "")
    .replace(/^\s*(Intel|AMD|Apple|Qualcomm)\s+/i, "")
    .replaceAll(/\s+/g, " ")
    .trim();
  return shortName || model.trim();
}

/**
 * Whether a block device path is the given disk or one of its partitions. Disks whose name ends
 * in a digit (nvme0n1, mmcblk0) number partitions with a "p".
 *
 * @example
 * isPartitionOf("/dev/nvme0n1p2", "nvme0n1"); // true
 * isPartitionOf("/dev/nvme0n10", "nvme0n1"); // false
 */
export function isPartitionOf(devicePath: string, diskName: string): boolean {
  const prefix = `/dev/${diskName}`;
  if (!devicePath.startsWith(prefix)) return false;
  const suffix = devicePath.slice(prefix.length);
  return suffix === "" || (/\d$/.test(diskName) ? /^p\d+$/.test(suffix) : /^\d+$/.test(suffix));
}

/**
 * Groups mounted filesystems by the disk they live on. Filesystems on no listed disk (LVM, RAID,
 * network mounts) are returned as `unassigned`.
 *
 * @example
 * const { byDisk, unassigned } = assignFilesystemsToDisks(inventory.storage, filesystems);
 * byDisk.get("nvme0n1"); // [{ mountPoint: "/", … }]
 */
export function assignFilesystemsToDisks(
  storage: readonly StorageDevice[],
  filesystems: readonly FilesystemUsageRecord[],
): { byDisk: Map<string, FilesystemUsageRecord[]>; unassigned: FilesystemUsageRecord[] } {
  const byDisk = new Map<string, FilesystemUsageRecord[]>(storage.map((device) => [device.name, []]));
  const unassigned: FilesystemUsageRecord[] = [];
  for (const filesystem of filesystems) {
    const disk = storage.find((device) => isPartitionOf(filesystem.device, device.name));
    if (disk) byDisk.get(disk.name)?.push(filesystem);
    else unassigned.push(filesystem);
  }
  return { byDisk, unassigned };
}

/**
 * One line about the installed memory: slots used, total size, type and speed.
 *
 * @example
 * summarizeMemory(slots); // "2 of 4 slots · 32 GB DDR5 @ 5600 MT/s"
 */
export function summarizeMemory(slots: readonly MemorySlot[], formatSize: (byteCount: number) => string): string {
  const modules = slots.flatMap((slot) => (slot.memoryModule ? [slot.memoryModule] : []));
  if (modules.length === 0) return `${slots.length} slots · no module details`;
  const totalBytes = modules.reduce((total, memoryModule) => total + (memoryModule.sizeBytes ?? 0), 0);
  const types = [
    ...new Set(modules.map((memoryModule) => memoryModule.type).filter((type): type is string => Boolean(type))),
  ];
  const speeds = modules
    .map((memoryModule) => memoryModule.configuredSpeedMegatransfers ?? memoryModule.speedMegatransfers)
    .filter((speed): speed is number => speed !== null);
  const speedText = speeds.length > 0 ? ` @ ${Math.min(...speeds)} MT/s` : "";
  return `${modules.length} of ${slots.length} slots · ${formatSize(totalBytes)}${types.length > 0 ? ` ${types.join("/")}` : ""}${speedText}`;
}

/**
 * The page header line: product, form factor, operating system and short kernel version.
 *
 * @example
 * buildMachineDescription(inventory); // "Lenovo ThinkCentre M75q Gen 2 · Mini PC · Ubuntu 24.04 LTS · kernel 6.8"
 */
export function buildMachineDescription(inventory: MachineInventory): string {
  const productName =
    [inventory.system.vendor, inventory.system.product].filter(Boolean).join(" ") ||
    [inventory.motherboard.vendor, inventory.motherboard.model].filter(Boolean).join(" ");
  const kernelVersion = inventory.operatingSystem.kernel?.match(/^\d+\.\d+/)?.[0] ?? inventory.operatingSystem.kernel;
  return [
    productName,
    readFormFactorLabel(inventory.formFactor),
    inventory.operatingSystem.name,
    kernelVersion ? `kernel ${kernelVersion}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The detail card a part belongs to: every memory slot opens the one Memory card.
 *
 * @example
 * readCardIdentifier("memory-slot-2"); // "memory"
 * readCardIdentifier("gpu-1"); // "gpu-1"
 */
export function readCardIdentifier(partId: string): string {
  return partId.startsWith("memory-slot-") ? "memory" : partId;
}

/**
 * The DOM id of a part's detail card, for scrolling it into view.
 *
 * @example
 * readCardElementId("processor-0"); // "machine-part-processor-0"
 */
export function readCardElementId(partId: string): string {
  return `machine-part-${readCardIdentifier(partId).replaceAll(/[^\w-]/g, "_")}`;
}

/**
 * A negotiated link speed in Mb/s or Gb/s.
 *
 * @example
 * formatLinkSpeed(2500); // "2.5 Gb/s"
 * formatLinkSpeed(100); // "100 Mb/s"
 */
export function formatLinkSpeed(megabits: number): string {
  return megabits >= 1000 ? `${Number((megabits / 1000).toFixed(1))} Gb/s` : `${megabits} Mb/s`;
}

/**
 * A clock speed in GHz.
 *
 * @example
 * formatClockSpeed(3600); // "3.60 GHz"
 */
export function formatClockSpeed(megahertz: number): string {
  return `${(megahertz / 1000).toFixed(2)} GHz`;
}

/**
 * The offset of item `index` in a `distributeAlong` result (0 when out of range).
 *
 * @example
 * offsetAt(distributeAlong({ count: 3, start: 0, length: 100, preferredSize: 20, gap: 10 }), 1); // 40
 */
export function offsetAt(layout: { offsets: readonly number[] }, index: number): number {
  return layout.offsets[index] ?? 0;
}
