import type { GpuPowerMode, GpuPowerState } from "@/lib/hardware/gpu-power";
import type { GeolocationResult } from "@/lib/watcher/geolocation";
import type { AppUsageReading, DiscoveredItem, FilesystemUsage, GpuDevice, ParsedLoginEvent, SystemSample } from "@/collector/types";

export interface DriverCapabilities {
  gpus: GpuDevice[];
  docker: boolean;
  systemd: boolean;
  sensors: boolean;
  journal: boolean;
  nginx: boolean;
  tailscale: boolean;
  loginHistorySource: string | null;
}

export interface LoginWatchHandle {
  stop: () => void;
}

/**
 * A collector backend. `linux` reads the real host; `mock` produces realistic fake data so the
 * whole app runs on macOS during development.
 */
export interface CollectorDriver {
  readonly name: "linux" | "mock";
  /** Probes what this host offers (GPUs, Docker, journal…). Called at start and every 10 minutes. */
  detectCapabilities(): Promise<DriverCapabilities>;
  /** One host-metrics reading. Rates are computed against the previous call. */
  sampleSystem(): Promise<SystemSample>;
  sampleFilesystems(): Promise<FilesystemUsage[]>;
  discoverItems(): Promise<DiscoveredItem[]>;
  sampleAppUsage(items: readonly DiscoveredItem[]): Promise<AppUsageReading[]>;
  /** Tails new sign-ins. `resumeCursor` is the last saved journal cursor, if any. */
  watchLogins(options: { resumeCursor: string | null; onLoginEvent: (loginEvent: ParsedLoginEvent) => void; onCursor: (cursor: string) => void }): LoginWatchHandle;
  /** Login history that was on the host before ServerLab was installed (first run only). */
  readLoginHistory(sinceTimestamp: number): Promise<ParsedLoginEvent[]>;
  /** Tailnet device names by Tailscale IP. */
  readTailnetDevices(): Promise<Map<string, string>>;
  /** The MagicDNS name (or host name) used for Lobby links. */
  readPublicHostname(): Promise<string>;
  readHostname(): string;
  /** Problems met while reading sources (unparseable nginx files…), shown in Settings. */
  readWarnings?(): string[];
  /** Hybrid-graphics hosts: the NVIDIA GPU's PRIME mode and whether a reboot is pending. */
  readGpuPowerState?(): Promise<GpuPowerState>;
  /** Switches the NVIDIA GPU's PRIME mode (applies after a reboot). Returns an error message, or null. */
  switchGpuPowerMode?(mode: GpuPowerMode): Promise<string | null>;
  /** Mock only: a fake location for an IP, since development machines have no GeoIP database. */
  overrideGeolocation?(ipAddress: string): GeolocationResult | null;
}
