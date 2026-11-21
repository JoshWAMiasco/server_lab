import type { GpuPowerMode, GpuPowerState } from "@/lib/hardware/gpu-power";
import type { HostActionResult, SecurityAction, SecurityState } from "@/lib/security/security-types";
import type { GeolocationResult } from "@/lib/watcher/geolocation";
import type { AppUsageReading, BootEndKind, BootIdentity, DiscoveredItem, FilesystemUsage, GpuDevice, MachineInventory, ParsedLoginEvent, SystemSample } from "@/collector/types";

export interface DriverCapabilities {
  gpus: GpuDevice[];
  docker: boolean;
  systemd: boolean;
  sensors: boolean;
  journal: boolean;
  nginx: boolean;
  tailscale: boolean;
  loginHistorySource: string | null;
  /** Motherboard, CPU, RAM modules, disks and NICs for the Machine page. */
  machineInventory: MachineInventory;
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
  /** The current boot's id and start time, for the uptime streak in `boot_sessions`. */
  readBootIdentity(): Promise<BootIdentity>;
  /** Called on SIGTERM: "reboot"/"shutdown" when the host is going down that way, null for a plain service stop. */
  readShutdownIntent(): Promise<Exclude<BootEndKind, "crash"> | null>;
  /** Called after a new boot when the last one ended unrecorded: how the previous boot ended, from the journal, or null if unknown. */
  readPreviousBootEnd(): Promise<Exclude<BootEndKind, "crash"> | null>;
  /** Problems met while reading sources (unparseable nginx files…), shown in Settings. */
  readWarnings?(): string[];
  /** Hybrid-graphics hosts: the NVIDIA GPU's PRIME mode and whether a reboot is pending. */
  readGpuPowerState?(): Promise<GpuPowerState>;
  /** Switches the NVIDIA GPU's PRIME mode (applies after a reboot). Returns an error message, or null. */
  switchGpuPowerMode?(mode: GpuPowerMode): Promise<string | null>;
  /** UFW and fail2ban state for the Firewall and fail2ban pages (through the root helper when installed). */
  readSecurityState?(): Promise<SecurityState>;
  /** Carries out one validated firewall or fail2ban change through the root helper. */
  runSecurityAction?(requestId: string, action: Exclude<SecurityAction, { kind: "snapshot" }>): Promise<HostActionResult>;
  /** Mock only: a fake location for an IP, since development machines have no GeoIP database. */
  overrideGeolocation?(ipAddress: string): GeolocationResult | null;
}
