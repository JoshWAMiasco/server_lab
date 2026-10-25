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
