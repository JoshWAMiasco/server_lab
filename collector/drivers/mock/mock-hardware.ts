import type { GpuDevice, MachineFormFactor, MachineInventory, MemoryModule, StorageDevice } from "@/collector/types";

const GIBIBYTE = 1024 ** 3;
const TEBIBYTE = 1024 ** 4;

/*
 * Mock hardware, shaped by environment variables so every Resources and Machine layout can be
 * tried on a development machine:
 *   MOCK_GPU_COUNT     0–16 GPUs (default 2), vendors and models rotate through MOCK_GPU_MODELS
 *   MOCK_CPU_CORES     1–256 logical cores (default 12)
 *   MOCK_FORM_FACTOR   desktop | laptop | mini | server (default desktop)
 */

export interface MockGpuModel {
  vendor: GpuDevice["vendor"];
  name: string;
  memoryTotalBytes: number | null;
  idleWatts: number | null;
  wattsPerPercent: number | null;
  driver: string;
}

const MOCK_GPU_MODELS: readonly MockGpuModel[] = [
  { vendor: "nvidia", name: "NVIDIA GeForce RTX 3060", memoryTotalBytes: 12 * GIBIBYTE, idleWatts: 25, wattsPerPercent: 1.4, driver: "nvidia 550.120" },
  { vendor: "amd", name: "AMD Radeon RX 7900 XTX", memoryTotalBytes: 24 * GIBIBYTE, idleWatts: 18, wattsPerPercent: 3.1, driver: "amdgpu" },
  { vendor: "nvidia", name: "NVIDIA RTX A4000", memoryTotalBytes: 16 * GIBIBYTE, idleWatts: 12, wattsPerPercent: 1.3, driver: "nvidia 550.120" },
  { vendor: "intel", name: "Intel Arc A770", memoryTotalBytes: 16 * GIBIBYTE, idleWatts: null, wattsPerPercent: null, driver: "xe" },
  { vendor: "nvidia", name: "Tesla P4", memoryTotalBytes: 7.5 * GIBIBYTE, idleWatts: 7, wattsPerPercent: 0.6, driver: "nvidia 550.120" },
];

function readBoundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

/**
 * The mock's logical core count from MOCK_CPU_CORES.
 */
export function readMockCoreCount(): number {
  return readBoundedInteger("MOCK_CPU_CORES", 12, 1, 256);
}

/**
 * The mock's GPUs from MOCK_GPU_COUNT, each with a model from the rotation.
 */
export function readMockGpuModels(): MockGpuModel[] {
  const gpuCount = readBoundedInteger("MOCK_GPU_COUNT", 2, 0, 16);
  return Array.from({ length: gpuCount }, (_, gpuIndex) => MOCK_GPU_MODELS[gpuIndex % MOCK_GPU_MODELS.length] as MockGpuModel);
}

/**
 * The mock's form factor from MOCK_FORM_FACTOR.
 */
export function readMockFormFactor(): MachineFormFactor {
  const requested = process.env.MOCK_FORM_FACTOR;
  return requested === "laptop" || requested === "mini" || requested === "server" ? requested : "desktop";
}

/**
 * GPU devices for the `gpus` capability, with PCI addresses on consecutive buses.
 */
export function buildMockGpuDevices(): GpuDevice[] {
  return readMockGpuModels().map((model, gpuIndex) => ({
    index: gpuIndex,
    pciAddress: `0000:${(gpuIndex + 1).toString(16).padStart(2, "0")}:00.0`,
    vendor: model.vendor,
    name: model.name,
    driver: model.driver,
    statsAvailable: true,
  }));
}

function buildModule(slot: string, bank: string, sizeBytes: number | null, type: string, formFactor: string, speedMegatransfers: number, manufacturer: string, partNumber: string, slotIndex: number): MemoryModule {
  const isInstalled = sizeBytes !== null;
  return {
    slot,
    bank,
    sizeBytes,
    type: isInstalled ? type : null,
    formFactor: isInstalled ? formFactor : null,
    speedMegatransfers: isInstalled ? speedMegatransfers : null,
    configuredSpeedMegatransfers: isInstalled ? speedMegatransfers : null,
    manufacturer: isInstalled ? manufacturer : null,
    partNumber: isInstalled ? partNumber : null,
    serialNumber: isInstalled ? `MOCK${(4_210_000 + slotIndex * 7919).toString(16).toUpperCase()}` : null,
  };
}

interface FormFactorProfile {
  chassisDescription: string;
  system: MachineInventory["system"];
  motherboard: MachineInventory["motherboard"];
  processorModel: string;
  processorVendor: string;
  socketCount: number;
  socketName: string;
  modules: MemoryModule[];
  maximumCapacityBytes: number;
  storage: StorageDevice[];
}

function buildProfile(formFactor: MachineFormFactor): FormFactorProfile {
  if (formFactor === "laptop") {
    return {
      chassisDescription: "Notebook",
      system: { vendor: "Framework", product: "Laptop 13 (AMD Ryzen 7040 Series)", version: "A8", serialNumber: "FRANMOCK0001" },
      motherboard: { vendor: "Framework", model: "FRANMDCP08", version: "A8", serialNumber: "FRMOCKBOARD01" },
      processorModel: "AMD Ryzen 7 7840U w/ Radeon 780M Graphics",
      processorVendor: "AuthenticAMD",
      socketCount: 1,
      socketName: "FP7",
      modules: [buildModule("DIMM 0", "P0 CHANNEL A", 16 * GIBIBYTE, "DDR5", "SODIMM", 5600, "Crucial", "CT16G56C46S5.M8G1", 0), buildModule("DIMM 1", "P0 CHANNEL B", 16 * GIBIBYTE, "DDR5", "SODIMM", 5600, "Crucial", "CT16G56C46S5.M8G1", 1)],
      maximumCapacityBytes: 96 * GIBIBYTE,
      storage: [{ name: "nvme0n1", model: "WD_BLACK SN850X 1TB", vendor: null, serialNumber: "MOCK22471B800123", sizeBytes: 1_000_204_886_016, kind: "nvme", transport: "nvme", revision: "620361WD" }],
    };
  }
  if (formFactor === "mini") {
    return {
      chassisDescription: "Mini PC",
      system: { vendor: "LENOVO", product: "ThinkCentre M75q Gen 2", version: "ThinkCentre M75q Gen 2", serialNumber: "MJ0MOCK1" },
      motherboard: { vendor: "LENOVO", model: "3156", version: "SDK0J40697 WIN", serialNumber: "L1HFMOCK001" },
      processorModel: "AMD Ryzen 5 PRO 5650GE with Radeon Graphics",
      processorVendor: "AuthenticAMD",
      socketCount: 1,
      socketName: "FP6",
      modules: [buildModule("DIMM 0", "BANK 0", 16 * GIBIBYTE, "DDR4", "SODIMM", 3200, "Samsung", "M471A2K43EB1-CWE", 0), buildModule("DIMM 1", "BANK 1", null, "DDR4", "SODIMM", 3200, "", "", 1)],
      maximumCapacityBytes: 64 * GIBIBYTE,
      storage: [
        { name: "nvme0n1", model: "SAMSUNG MZVLB512HBJQ-000L7", vendor: null, serialNumber: "S4ENMOCK123456", sizeBytes: 512_110_190_592, kind: "nvme", transport: "nvme", revision: "5M2QEXF7" },
        { name: "sda", model: "Samsung SSD 870 EVO 2TB", vendor: "ATA", serialNumber: "S6PNMOCK654321", sizeBytes: 2_000_398_934_016, kind: "ssd", transport: "sata", revision: "SVT02B6Q" },
      ],
    };
  }
  if (formFactor === "server") {
    const slots = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
    return {
      chassisDescription: "Rack Mount Chassis",
      system: { vendor: "Supermicro", product: "SYS-2029P-C1R", version: "0123456789", serialNumber: "S2MOCK00123" },
      motherboard: { vendor: "Supermicro", model: "X11DPi-N", version: "1.10", serialNumber: "ZM19MOCK001" },
      processorModel: "Intel(R) Xeon(R) Silver 4214R CPU @ 2.40GHz",
      processorVendor: "GenuineIntel",
      socketCount: 2,
      socketName: "CPU",
      modules: slots.map((slot, slotIndex) => buildModule(`P${slotIndex < 4 ? 1 : 2}-DIMM${slot}`, `P${slotIndex < 4 ? 0 : 1}_Node${slotIndex < 4 ? 0 : 1}_Channel${slotIndex % 4}_Dimm0`, slotIndex % 4 < 3 ? 32 * GIBIBYTE : null, "DDR4", "DIMM", 2933, "Samsung", "M393A4K40DB2-CVF", slotIndex)),
      maximumCapacityBytes: 2048 * GIBIBYTE,
      storage: [
        { name: "nvme0n1", model: "INTEL SSDPE2KX020T8", vendor: null, serialNumber: "PHLJMOCK0001", sizeBytes: 2_000_398_934_016, kind: "nvme", transport: "nvme", revision: "VDV10131" },
        ...["sda", "sdb", "sdc", "sdd"].map((name, diskIndex) => ({ name, model: "ST8000NM000A-2KE101", vendor: "ATA", serialNumber: `WKD0MOCK${diskIndex}`, sizeBytes: 8 * TEBIBYTE, kind: "hdd" as const, transport: "sata", revision: "SN02" })),
      ],
    };
  }
  return {
    chassisDescription: "Desktop",
    system: { vendor: "ASUS", product: "System Product Name", version: "System Version", serialNumber: null },
    motherboard: { vendor: "ASUSTeK COMPUTER INC.", model: "PRIME B650M-A WIFI II", version: "Rev 1.xx", serialNumber: "231185MOCK00123" },
    processorModel: "AMD Ryzen 9 7900 12-Core Processor",
    processorVendor: "AuthenticAMD",
    socketCount: 1,
    socketName: "AM5",
    modules: ["DIMM_A1", "DIMM_A2", "DIMM_B1", "DIMM_B2"].map((slot, slotIndex) => buildModule(slot, `P0 CHANNEL ${slotIndex < 2 ? "A" : "B"}`, 16 * GIBIBYTE, "DDR5", "DIMM", 5600, "Kingston", "KF556C40-16", slotIndex)),
    maximumCapacityBytes: 192 * GIBIBYTE,
    storage: [
      { name: "nvme0n1", model: "Samsung SSD 980 PRO 1TB", vendor: null, serialNumber: "S5GXMOCK123456", sizeBytes: 1_000_204_886_016, kind: "nvme", transport: "nvme", revision: "5B2QGXA7" },
      { name: "sda", model: "WDC WD40EFZX-68AWUN0", vendor: "ATA", serialNumber: "WD-WXMOCK123456", sizeBytes: 4_000_787_030_016, kind: "hdd", transport: "sata", revision: "81.00B81" },
      { name: "sdb", model: "Crucial MX500 2TB", vendor: "ATA", serialNumber: "2213MOCK1234", sizeBytes: 2_000_398_934_016, kind: "ssd", transport: "sata", revision: "M3CR045" },
      { name: "sdc", model: "Extreme Pro", vendor: "SanDisk", serialNumber: "MOCKUSB0001", sizeBytes: 256_060_514_304, kind: "usb", transport: "usb", revision: "0001" },
    ],
  };
}

/**
 * A complete hardware inventory for the mock host, matching MOCK_FORM_FACTOR and MOCK_CPU_CORES.
 */
export function buildMockMachineInventory(): MachineInventory {
  const formFactor = readMockFormFactor();
  const profile = buildProfile(formFactor);
  const threadsPerSocket = Math.max(1, Math.round(readMockCoreCount() / profile.socketCount));
  return {
    formFactor,
    chassisDescription: profile.chassisDescription,
    system: profile.system,
    motherboard: profile.motherboard,
    bios: { vendor: "American Megatrends International, LLC.", version: "1813", releaseDate: "2024-05-07" },
    operatingSystem: { name: "Ubuntu 24.04.1 LTS", kernel: "6.8.0-49-generic", architecture: "x86_64" },
    processors: Array.from({ length: profile.socketCount }, (_, socketIndex) => ({
      socket: profile.socketCount > 1 ? `${profile.socketName}${socketIndex + 1}` : profile.socketName,
      vendor: profile.processorVendor,
      model: profile.processorModel,
      architecture: "x86_64",
      coreCount: Math.max(1, Math.round(threadsPerSocket / 2)),
      threadCount: threadsPerSocket,
      baseMegahertz: 3700,
      maximumMegahertz: 5400,
      caches: [
        { level: "L1d", bytes: 384 * 1024 },
        { level: "L1i", bytes: 384 * 1024 },
        { level: "L2", bytes: 12 * 1024 * 1024 },
        { level: "L3", bytes: 64 * 1024 * 1024 },
      ],
      virtualization: profile.processorVendor === "GenuineIntel" ? "VT-x" : "AMD-V",
    })),
    memory: { source: "dmidecode", slotCount: profile.modules.length, maximumCapacityBytes: profile.maximumCapacityBytes, modules: profile.modules },
    storage: profile.storage,
    networkAdapters: [
      { interfaceName: "enp3s0", macAddress: "a8:a1:59:00:00:01", speedMegabits: 2500, model: "Realtek Semiconductor Co., Ltd. RTL8125 2.5GbE Controller", driver: "r8169", isWireless: false, isUp: true },
      { interfaceName: "wlp4s0", macAddress: "a8:a1:59:00:00:02", speedMegabits: null, model: "MEDIATEK Corp. MT7922 802.11ax PCI Express Wireless Network Adapter", driver: "mt7921e", isWireless: true, isUp: false },
    ],
    hasHardwareInventoryFile: true,
  };
}

/**
 * Total installed RAM of the mock inventory, so the live memory numbers match the module table.
 */
export function readMockMemoryTotalBytes(): number {
  return buildMockMachineInventory().memory.modules.reduce((total, memoryModule) => total + (memoryModule.sizeBytes ?? 0), 0);
}
