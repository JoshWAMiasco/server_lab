/*
 * Shapes shared by the collector's sources, parsers and drivers. Parsers in collector/parsers turn
 * raw host output into these; drivers return them to the scheduler, which writes them to SQLite.
 */

export interface CpuTimes {
  busy: number;
  total: number;
}

export interface ProcessorStatistics {
  aggregate: CpuTimes;
  cores: CpuTimes[];
}

export interface MemoryInformation {
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  cachedBytes: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
}

export interface NetworkInterfaceCounters {
  interfaceName: string;
  receivedBytes: number;
  transmittedBytes: number;
}

export interface DiskCounters {
  deviceName: string;
  readBytes: number;
  writtenBytes: number;
}

export interface MountEntry {
  device: string;
  mountPoint: string;
  filesystemType: string;
}

export type BindScope = "local" | "tailnet" | "exposed";
export type NetworkTag = "public" | "lan" | "tailnet";

export interface ListeningSocket {
  protocol: "tcp" | "udp";
  localAddress: string;
  port: number;
  processName: string | null;
  processId: number | null;
}

export interface NginxSite {
  serverNames: string[];
  listenPorts: number[];
  listenAddresses: string[];
  isSsl: boolean;
  isDefaultServer: boolean;
  staticRoot: string | null;
  proxyPassPort: number | null;
  proxyPassTarget: string | null;
  sourceFile: string;
}

export type LoginResult = "success" | "failure" | "invalid_user";
export type LoginChannel = "ssh" | "web" | "console";

export interface ParsedLoginEvent {
  timestamp: number;
  channel: LoginChannel;
  username: string;
  result: LoginResult;
  method: string;
  sourceAddress: string | null;
  sourcePort: number | null;
  raw: string;
}

export interface GpuReading {
  gpuIndex: number;
  vendor: "nvidia" | "amd" | "intel";
  name: string;
  utilizationPercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  temperatureCelsius: number | null;
  powerWatts: number | null;
}

export interface GpuDevice {
  index: number;
  pciAddress: string;
  vendor: "nvidia" | "amd" | "intel";
  name: string;
  driver: string | null;
  statsAvailable: boolean;
  unavailableReason?: string;
}

export interface TemperatureReading {
  label: string;
  celsius: number;
}

export interface SystemSample {
  timestamp: number;
  cpuPercent: number;
  corePercents: number[];
  loadAverages: [number, number, number];
  memory: MemoryInformation;
  cpuTemperatureCelsius: number | null;
  temperatures: TemperatureReading[];
  networkInterfaces: { interfaceName: string; receivedBytesPerSecond: number; transmittedBytesPerSecond: number }[];
  disks: { deviceName: string; readBytesPerSecond: number; writtenBytesPerSecond: number }[];
  gpus: GpuReading[];
  uptimeSeconds: number;
}

export interface FilesystemUsage {
  mountPoint: string;
  device: string;
  filesystemType: string;
  usedBytes: number;
  sizeBytes: number;
}

export type ItemSource = "docker" | "systemd" | "port" | "nginx";
export type ItemState = "running" | "exited" | "failed" | "starting" | "unknown";
export type ItemHealth = "healthy" | "unhealthy" | "starting" | "none";

export interface DiscoveredPort {
  hostPort: number;
  containerPort: number | null;
  protocol: "tcp" | "udp";
  hostAddress: string;
}

export interface DiscoveredItem {
  key: string;
  source: ItemSource;
  rawName: string;
  image: string | null;
  unit: string | null;
  processName: string | null;
  description: string | null;
  ports: DiscoveredPort[];
  labels: Record<string, string>;
  state: ItemState;
  health: ItemHealth;
  startedAt: number | null;
  bindScope: BindScope;
  extra: Record<string, unknown>;
}

export interface AppUsageReading {
  appKey: string;
  source: "docker" | "systemd" | "port";
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number | null;
}

export type GpuVendor = GpuReading["vendor"];

export interface NvidiaGpuReading extends GpuReading {
  pciBusId: string | null;
}

/*
 * Hardware inventory for the Machine page and the Resources memory panel. Detected every 10 minutes
 * and stored as the `machineInventory` capability. Every field a host may not report is nullable.
 */
export type MachineFormFactor = "desktop" | "laptop" | "mini" | "server" | "all-in-one" | "unknown";

export interface MemoryModule {
  /** Slot label such as "DIMM_A1" or "ChannelA-DIMM0". */
  slot: string;
  bank: string | null;
  /** null for an empty slot. */
  sizeBytes: number | null;
  /** DDR4, DDR5, LPDDR5… */
  type: string | null;
  /** DIMM, SODIMM, Row Of Chips (soldered)… */
  formFactor: string | null;
  speedMegatransfers: number | null;
  configuredSpeedMegatransfers: number | null;
  manufacturer: string | null;
  partNumber: string | null;
  serialNumber: string | null;
}

export interface MemoryInventory {
  /** Where module details came from: the root-written dmidecode file, EDAC sysfs, or nothing. */
  source: "dmidecode" | "edac" | "none";
  /** Physical slots, filled and empty; null when unknown. */
  slotCount: number | null;
  maximumCapacityBytes: number | null;
  /** Every slot, filled ones first by slot order; empty ones have sizeBytes null. */
  modules: MemoryModule[];
}

export interface ProcessorCacheSize {
  /** "L1d", "L1i", "L2", "L3". */
  level: string;
  bytes: number;
}

export interface ProcessorInventory {
  socket: string | null;
  vendor: string | null;
  model: string;
  architecture: string | null;
  coreCount: number | null;
  threadCount: number | null;
  baseMegahertz: number | null;
  maximumMegahertz: number | null;
  caches: ProcessorCacheSize[];
  /** "VT-x", "AMD-V" or null. */
  virtualization: string | null;
}

export type StorageKind = "nvme" | "ssd" | "hdd" | "usb" | "other";

export interface StorageDevice {
  /** Kernel name without /dev, e.g. "nvme0n1" or "sda". */
  name: string;
  model: string | null;
  vendor: string | null;
  serialNumber: string | null;
  sizeBytes: number;
  kind: StorageKind;
  transport: string | null;
  revision: string | null;
}

export interface NetworkAdapter {
  interfaceName: string;
  macAddress: string | null;
  /** Negotiated link speed, null when down or unknown. */
  speedMegabits: number | null;
  model: string | null;
  driver: string | null;
  isWireless: boolean;
  isUp: boolean;
}

export interface MachineInventory {
  formFactor: MachineFormFactor;
  /** The SMBIOS chassis description, e.g. "Notebook", "Mini PC", "Rack Mount Chassis". */
  chassisDescription: string | null;
  system: { vendor: string | null; product: string | null; version: string | null; serialNumber: string | null };
  motherboard: { vendor: string | null; model: string | null; version: string | null; serialNumber: string | null };
  bios: { vendor: string | null; version: string | null; releaseDate: string | null };
  operatingSystem: { name: string | null; kernel: string | null; architecture: string | null };
  processors: ProcessorInventory[];
  memory: MemoryInventory;
  storage: StorageDevice[];
  networkAdapters: NetworkAdapter[];
  /** Whether the root-written dmidecode file was found (serials and slot details need it). */
  hasHardwareInventoryFile: boolean;
}

/** How a boot ended. A reboot keeps the uptime streak; a shutdown or a crash resets it. */
export type BootEndKind = "reboot" | "shutdown" | "crash";

export interface BootIdentity {
  /** /proc/sys/kernel/random/boot_id, new on every boot. */
  bootId: string;
  /** Epoch ms the kernel booted (now − /proc/uptime). */
  bootedAt: number;
}
