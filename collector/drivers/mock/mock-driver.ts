import operatingSystem from "node:os";
import type { CollectorDriver, DriverCapabilities, LoginWatchHandle } from "@/collector/driver";
import { MOCK_APPLICATIONS, MOCK_ATTACKER_ADDRESSES, MOCK_NGINX_SITES, MOCK_TAILNET_DEVICES, MOCK_USERNAMES } from "@/collector/drivers/mock/mock-fixtures";
import { MockSecurity } from "@/collector/drivers/mock/mock-security";
import { RandomWalk } from "@/collector/drivers/mock/random-walk";
import type { AppUsageReading, DiscoveredItem, FilesystemUsage, ParsedLoginEvent, SystemSample } from "@/collector/types";
import type { GpuPowerMode, GpuPowerState } from "@/lib/hardware/gpu-power";
import type { HostActionResult, SecurityAction, SecurityState } from "@/lib/security/security-types";
import type { GeolocationResult } from "@/lib/watcher/geolocation";

const GIBIBYTE = 1024 ** 3;
const CORE_COUNT = 12;
const DAY_MILLISECONDS = 86_400_000;

const MOCK_LOCATIONS: Record<string, GeolocationResult> = {
  "185.220.101.34": { countryName: "Germany", countryCode: "DE", cityName: "Frankfurt am Main", latitude: 50.11, longitude: 8.68 },
  "45.155.205.233": { countryName: "Russia", countryCode: "RU", cityName: "Moscow", latitude: 55.75, longitude: 37.62 },
  "103.145.13.92": { countryName: "Vietnam", countryCode: "VN", cityName: "Hanoi", latitude: 21.03, longitude: 105.85 },
  "218.92.0.112": { countryName: "China", countryCode: "CN", cityName: "Nanjing", latitude: 32.06, longitude: 118.78 },
  "61.177.172.140": { countryName: "China", countryCode: "CN", cityName: "Wuxi", latitude: 31.57, longitude: 120.3 },
  "194.169.175.36": { countryName: "Netherlands", countryCode: "NL", cityName: "Amsterdam", latitude: 52.37, longitude: 4.9 },
  "92.118.39.62": { countryName: "Romania", countryCode: "RO", cityName: "Bucharest", latitude: 44.43, longitude: 26.1 },
  "179.43.180.106": { countryName: "Switzerland", countryCode: "CH", cityName: "Zurich", latitude: 47.37, longitude: 8.54 },
  "5.188.206.14": { countryName: "Russia", countryCode: "RU", cityName: "Saint Petersburg", latitude: 59.93, longitude: 30.31 },
  "80.94.95.115": { countryName: "Bulgaria", countryCode: "BG", cityName: "Sofia", latitude: 42.69, longitude: 23.32 },
};

function pickRandom<ItemType>(items: readonly ItemType[]): ItemType {
  return items[Math.floor(Math.random() * items.length)] as ItemType;
}

/**
 * Fake data for development on macOS: random-walk metrics with occasional spikes, a dozen apps,
 * an NVIDIA GPU, nginx sites and a steady trickle of SSH brute-force attempts.
 */
export class MockDriver implements CollectorDriver {
  readonly name = "mock" as const;
  private readonly startedAt = Date.now();
  private readonly cpuWalk = new RandomWalk(28, 6, 2, 100);
  private readonly coreWalks = Array.from({ length: CORE_COUNT }, () => new RandomWalk(28, 14, 0, 100));
  private readonly memoryWalk = new RandomWalk(12.1, 0.15, 6, 30);
  private readonly temperatureWalk = new RandomWalk(54, 1.2, 35, 92);
  private readonly nvmeWalk = new RandomWalk(41, 0.6, 30, 70);
  private readonly gpuWalk = new RandomWalk(35, 9, 0, 100);
  private readonly gpuTemperatureWalk = new RandomWalk(58, 1, 30, 90);
  private readonly receiveWalk = new RandomWalk(4_000_000, 1_500_000, 20_000, 120_000_000);
  private readonly transmitWalk = new RandomWalk(900_000, 400_000, 10_000, 60_000_000);
  private readonly tailscaleWalk = new RandomWalk(150_000, 80_000, 0, 20_000_000);
  private gpuPowerMode: GpuPowerMode = "on-demand";
  private readonly security = new MockSecurity();
  private readonly diskReadWalk = new RandomWalk(2_000_000, 1_500_000, 0, 400_000_000);
  private readonly diskWriteWalk = new RandomWalk(1_200_000, 900_000, 0, 300_000_000);
  private readonly appWalks = new Map(MOCK_APPLICATIONS.map((application) => [application.item.key, { memory: new RandomWalk(application.memoryCenterBytes, application.memoryCenterBytes * 0.02, application.memoryCenterBytes * 0.6, application.memoryCenterBytes * 1.4), cpu: new RandomWalk(application.cpuCenterPercent, application.cpuCenterPercent * 0.4 + 0.1, 0, 100) }]));

  async detectCapabilities(): Promise<DriverCapabilities> {
    return {
      gpus: [{ index: 0, pciAddress: "0000:01:00.0", vendor: "nvidia", name: "NVIDIA GeForce RTX 3060", driver: "nvidia 550.120", statsAvailable: true }],
      docker: true,
      systemd: true,
      sensors: true,
      journal: true,
      nginx: true,
      tailscale: true,
      loginHistorySource: "mock",
    };
  }

  async sampleSystem(): Promise<SystemSample> {
    const cpuPercent = this.cpuWalk.next();
    const memoryUsedBytes = this.memoryWalk.next() * GIBIBYTE;
    const gpuUtilization = this.gpuWalk.next();
    return {
      timestamp: Date.now(),
      cpuPercent,
      corePercents: this.coreWalks.map((coreWalk) => Math.min(100, Math.max(0, (coreWalk.next() + cpuPercent) / 2))),
      loadAverages: [(cpuPercent / 100) * CORE_COUNT, (cpuPercent / 110) * CORE_COUNT, (cpuPercent / 120) * CORE_COUNT],
      memory: { totalBytes: 32 * GIBIBYTE, availableBytes: 32 * GIBIBYTE - memoryUsedBytes, usedBytes: memoryUsedBytes, cachedBytes: 9.4 * GIBIBYTE, swapTotalBytes: 4 * GIBIBYTE, swapUsedBytes: 0.3 * GIBIBYTE },
      cpuTemperatureCelsius: this.temperatureWalk.next() + cpuPercent * 0.15,
      temperatures: [
        { label: "nvme0 Composite", celsius: this.nvmeWalk.next() },
        { label: "acpitz", celsius: 27.8 },
      ],
      networkInterfaces: [
        { interfaceName: "enp3s0", receivedBytesPerSecond: this.receiveWalk.next(), transmittedBytesPerSecond: this.transmitWalk.next() },
        { interfaceName: "tailscale0", receivedBytesPerSecond: this.tailscaleWalk.next(), transmittedBytesPerSecond: this.tailscaleWalk.next() * 0.6 },
      ],
      disks: [
        { deviceName: "nvme0n1", readBytesPerSecond: this.diskReadWalk.next(), writtenBytesPerSecond: this.diskWriteWalk.next() },
        { deviceName: "sda", readBytesPerSecond: this.diskReadWalk.next() * 0.3, writtenBytesPerSecond: this.diskWriteWalk.next() * 0.2 },
      ],
      gpus: [{ gpuIndex: 0, vendor: "nvidia", name: "NVIDIA GeForce RTX 3060", utilizationPercent: gpuUtilization, memoryUsedBytes: (2 + gpuUtilization / 15) * GIBIBYTE, memoryTotalBytes: 12 * GIBIBYTE, temperatureCelsius: this.gpuTemperatureWalk.next() + gpuUtilization * 0.1, powerWatts: 25 + gpuUtilization * 1.4 }],
      uptimeSeconds: 12 * 86_400 + 4 * 3600 + (Date.now() - this.startedAt) / 1000,
    };
  }

  async sampleFilesystems(): Promise<FilesystemUsage[]> {
    const growth = ((Date.now() - this.startedAt) / DAY_MILLISECONDS) * 2 * GIBIBYTE;
    return [
      { mountPoint: "/", device: "/dev/nvme0n1p2", filesystemType: "ext4", usedBytes: 412 * GIBIBYTE + growth, sizeBytes: 580 * GIBIBYTE },
      { mountPoint: "/boot/efi", device: "/dev/nvme0n1p1", filesystemType: "vfat", usedBytes: 0.006 * GIBIBYTE, sizeBytes: 1 * GIBIBYTE },
      { mountPoint: "/mnt/media", device: "/dev/sda1", filesystemType: "ext4", usedBytes: 3.29 * 1024 * GIBIBYTE, sizeBytes: 3.58 * 1024 * GIBIBYTE },
      { mountPoint: "/mnt/backup", device: "/dev/sdb1", filesystemType: "xfs", usedBytes: 0.81 * 1024 * GIBIBYTE, sizeBytes: 1.82 * 1024 * GIBIBYTE },
    ];
  }

  async discoverItems(): Promise<DiscoveredItem[]> {
    const now = Date.now();
    const applications = MOCK_APPLICATIONS.map((application) => ({
      ...application.item,
      extra: application.item.extra ?? {},
      startedAt: application.item.state === "running" ? this.startedAt - application.uptimeDays * DAY_MILLISECONDS - 3_600_000 : null,
      health: application.item.health === "starting" && now - this.startedAt > 90_000 ? ("healthy" as const) : application.item.health,
    }));
    return [...applications, ...MOCK_NGINX_SITES.map((site) => ({ ...site, extra: { ...site.extra } }))];
  }

  async sampleAppUsage(items: readonly DiscoveredItem[]): Promise<AppUsageReading[]> {
    return items
      .filter((item) => item.source !== "nginx" && item.state === "running")
      .flatMap((item) => {
        const walks = this.appWalks.get(item.key);
        const application = MOCK_APPLICATIONS.find((candidate) => candidate.item.key === item.key);
        if (!walks || !application) return [];
        return [{ appKey: item.key, source: item.source as AppUsageReading["source"], cpuPercent: walks.cpu.next(), memoryBytes: walks.memory.next(), memoryLimitBytes: application.memoryLimitBytes }];
      });
  }

  private createLoginEvent(timestamp: number): ParsedLoginEvent {
    if (Math.random() < 0.08) {
      const [sourceAddress] = pickRandom([...MOCK_TAILNET_DEVICES.entries()]);
      return { timestamp, channel: "ssh", username: "joshua", result: "success", method: "publickey", sourceAddress, sourcePort: 50_000 + Math.floor(Math.random() * 10_000), raw: `Accepted publickey for joshua from ${sourceAddress} port 52144 ssh2: ED25519 SHA256:mock` };
    }
    if (Math.random() < 0.05) {
      return { timestamp, channel: "ssh", username: "joshua", result: "success", method: "publickey", sourceAddress: "192.168.1.24", sourcePort: 61_022, raw: "Accepted publickey for joshua from 192.168.1.24 port 61022 ssh2" };
    }
    const sourceAddress = pickRandom(MOCK_ATTACKER_ADDRESSES);
    const username = pickRandom(MOCK_USERNAMES);
    const isInvalidUser = username !== "root" && Math.random() < 0.6;
    return {
      timestamp,
      channel: "ssh",
      username,
      result: isInvalidUser ? "invalid_user" : "failure",
      method: "password",
      sourceAddress,
      sourcePort: 30_000 + Math.floor(Math.random() * 30_000),
      raw: isInvalidUser ? `Invalid user ${username} from ${sourceAddress} port 40122` : `Failed password for ${username} from ${sourceAddress} port 40122 ssh2`,
    };
  }

  watchLogins({ onLoginEvent }: { resumeCursor: string | null; onLoginEvent: (loginEvent: ParsedLoginEvent) => void; onCursor: (cursor: string) => void }): LoginWatchHandle {
    let timeout: NodeJS.Timeout | undefined;
    const scheduleNext = () => {
      timeout = setTimeout(() => {
        const burstSize = Math.random() < 0.2 ? 6 : 1;
        const loginEvent = this.createLoginEvent(Date.now());
        for (let attempt = 0; attempt < burstSize; attempt += 1) onLoginEvent({ ...loginEvent, timestamp: loginEvent.timestamp + attempt, sourcePort: (loginEvent.sourcePort ?? 0) + attempt });
        scheduleNext();
      }, 5000 + Math.random() * 20_000);
    };
    scheduleNext();
    return { stop: () => clearTimeout(timeout) };
  }

  async readLoginHistory(sinceTimestamp: number): Promise<ParsedLoginEvent[]> {
    const historyStart = Math.max(sinceTimestamp, Date.now() - 30 * DAY_MILLISECONDS);
    const loginEvents: ParsedLoginEvent[] = [];
    for (let timestamp = historyStart; timestamp < Date.now() - 60_000; timestamp += 10 * 60_000 + Math.random() * 60 * 60_000) loginEvents.push(this.createLoginEvent(Math.round(timestamp)));
    return loginEvents;
  }

  async readTailnetDevices(): Promise<Map<string, string>> {
    return MOCK_TAILNET_DEVICES;
  }

  async readPublicHostname(): Promise<string> {
    return process.env.PUBLIC_HOSTNAME || "homelab.tail1234.ts.net";
  }

  readHostname(): string {
    return `${operatingSystem.hostname().split(".")[0]} (mock)`;
  }

  overrideGeolocation(ipAddress: string): GeolocationResult | null {
    return MOCK_LOCATIONS[ipAddress] ?? null;
  }

  /** The fake NVIDIA GPU stays on (a mock never reboots), so a switch to "off" shows as pending. */
  async readGpuPowerState(): Promise<GpuPowerState> {
    return { isSupported: true, configuredMode: this.gpuPowerMode, isPoweredOn: true, isRebootPending: this.gpuPowerMode === "off" };
  }

  async readSecurityState(): Promise<SecurityState> {
    return this.security.readState();
  }

  async runSecurityAction(requestId: string, action: Exclude<SecurityAction, { kind: "snapshot" }>): Promise<HostActionResult> {
    return this.security.run(requestId, action);
  }

  async switchGpuPowerMode(mode: GpuPowerMode): Promise<string | null> {
    this.gpuPowerMode = mode;
    return null;
  }
}
