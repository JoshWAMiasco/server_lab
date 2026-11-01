import fileSystem from "node:fs";
import operatingSystem from "node:os";
import type { CollectorDriver, DriverCapabilities, LoginWatchHandle } from "@/collector/driver";
import { AppUsageSource } from "@/collector/drivers/linux/app-usage-source";
import { discoverDockerContainers } from "@/collector/drivers/linux/docker-source";
import { readFilesystemUsage } from "@/collector/drivers/linux/filesystem-source";
import { GpuSource } from "@/collector/drivers/linux/gpu-source";
import { readGpuPowerState, switchGpuPowerMode } from "@/collector/drivers/linux/gpu-power-source";
import { readHardwareTemperatures } from "@/collector/drivers/linux/hardware-monitor-source";
import { readListeners, resolveListenerOwner, toPortItems, type ListenerOwner } from "@/collector/drivers/linux/listener-source";
import { LoginSource } from "@/collector/drivers/linux/login-source";
import { NginxSource, toNginxItems } from "@/collector/drivers/linux/nginx-source";
import { isProgramAvailable } from "@/collector/drivers/linux/run-command";
import { readSecurityState, runThroughHelper } from "@/collector/drivers/linux/security-source";
import { SystemReader } from "@/collector/drivers/linux/system-source";
import { readSystemdUnits, toSystemdItems } from "@/collector/drivers/linux/systemd-source";
import { mapTailnetDevices, readMagicDnsName, readPeerApiPorts, readTailscaleStatus } from "@/collector/drivers/linux/tailscale-source";
import { classifyBindAddress, widestBindScope } from "@/collector/parsers/parse-ss-listeners";
import { isDockerAvailable } from "@/collector/sources/docker-client";
import type { AppUsageReading, DiscoveredItem, FilesystemUsage, ListeningSocket, ParsedLoginEvent, SystemSample } from "@/collector/types";
import { matchCatalogEntry } from "@/lib/catalog/catalog";
import type { GpuPowerMode, GpuPowerState } from "@/lib/hardware/gpu-power";
import type { HostActionResult, SecurityAction, SecurityState } from "@/lib/security/security-types";
import { readEnvironment } from "@/lib/environment";

const SERVERLAB_WEB_PORT = 3000;

/**
 * The real driver for Ubuntu Server: /proc and /sys for metrics, cgroup v2 for app usage, the
 * Docker API (GET only), systemctl, ss and nginx's configs for the Lobby, and the journal for
 * logins. Every source degrades to "not available" instead of failing the collector.
 */
export class LinuxDriver implements CollectorDriver {
  readonly name = "linux" as const;
  private readonly systemReader = new SystemReader();
  private readonly gpuSource = new GpuSource();
  private readonly nginxSource = new NginxSource();
  private readonly appUsageSource = new AppUsageSource();
  private readonly loginSource = new LoginSource();
  private hasDocker = false;
  private hasNginx = false;

  async detectCapabilities(): Promise<DriverCapabilities> {
    const [gpus, hasDocker, hasSystemd, temperatures, hasJournal, hasNginx, tailscaleStatus, hasLast, hasWtmpdb] = await Promise.all([
      this.gpuSource.detect(),
      isDockerAvailable(),
      isProgramAvailable("systemctl"),
      readHardwareTemperatures(),
      this.loginSource.canReadJournal(),
      this.nginxSource.isAvailable(),
      readTailscaleStatus(),
      isProgramAvailable("last"),
      isProgramAvailable("wtmpdb"),
    ]);
    this.hasDocker = hasDocker;
    this.hasNginx = hasNginx;
    const hasAuthLog = fileSystem.existsSync("/var/log/auth.log");
    return {
      gpus,
      docker: hasDocker,
      systemd: hasSystemd,
      sensors: temperatures.cpuCelsius !== null || temperatures.otherSensors.length > 0,
      journal: hasJournal,
      nginx: hasNginx,
      tailscale: tailscaleStatus !== null,
      loginHistorySource: hasJournal ? "journal" : hasAuthLog ? "auth.log" : hasLast ? "wtmp" : hasWtmpdb ? "wtmpdb" : null,
    };
  }

  async sampleSystem(): Promise<SystemSample> {
    const [system, gpus] = await Promise.all([this.systemReader.read(), this.gpuSource.read().catch(() => [])]);
    return { ...system, gpus };
  }

  sampleFilesystems(): Promise<FilesystemUsage[]> {
    return readFilesystemUsage();
  }

  async discoverItems(): Promise<DiscoveredItem[]> {
    const [containers, units, listeners, sites, tailscaleStatus] = await Promise.all([
      this.hasDocker ? discoverDockerContainers().catch(() => []) : Promise.resolve([]),
      readSystemdUnits().catch(() => []),
      readListeners().catch(() => [] as ListeningSocket[]),
      this.hasNginx ? this.nginxSource.readSites().catch(() => []) : Promise.resolve([]),
      readTailscaleStatus(),
    ]);
    const unitItems = toSystemdItems(units);
    const dockerPorts = new Set(containers.flatMap((container) => container.ports.map((port) => port.hostPort)));
    const unitPortHints = new Map<number, string>();
    const nginxPorts = new Set(sites.flatMap((site) => site.listenPorts));
    const nginxUnit = unitItems.find((item) => item.unit === "nginx.service");
    if (nginxUnit?.unit) for (const port of nginxPorts) unitPortHints.set(port, nginxUnit.unit);
    const tailscaleUnit = unitItems.find((item) => item.unit === "tailscaled.service");
    if (tailscaleUnit?.unit) for (const port of readPeerApiPorts(tailscaleStatus)) unitPortHints.set(port, tailscaleUnit.unit);
    for (const unitItem of unitItems) {
      const defaultPort = matchCatalogEntry({ unit: unitItem.unit })?.defaultPort;
      if (defaultPort && unitItem.unit && !unitPortHints.has(defaultPort)) unitPortHints.set(defaultPort, unitItem.unit);
    }

    const ownPort = Number(readEnvironment("SERVERLAB_WEB_PORT") ?? SERVERLAB_WEB_PORT);
    const listenersByUnit = new Map<string, ListeningSocket[]>();
    const unownedListeners: { listener: ListeningSocket; owner: Extract<ListenerOwner, { kind: "process" }> }[] = [];
    for (const listener of listeners) {
      const owner = await resolveListenerOwner(listener, { dockerPorts, unitPortHints, ownPort });
      if (owner.kind === "unit") listenersByUnit.set(owner.unit, [...(listenersByUnit.get(owner.unit) ?? []), listener]);
      else if (owner.kind === "process") unownedListeners.push({ listener, owner });
    }
    for (const unitItem of unitItems) {
      const unitListeners = listenersByUnit.get(unitItem.unit ?? "") ?? [];
      const uniqueListeners = [...new Map(unitListeners.map((listener) => [`${listener.localAddress}:${listener.port}`, listener])).values()];
      unitItem.ports = uniqueListeners.map((listener) => ({ hostPort: listener.port, containerPort: null, protocol: listener.protocol, hostAddress: listener.localAddress }));
      unitItem.bindScope = uniqueListeners.length > 0 ? widestBindScope(uniqueListeners.map((listener) => classifyBindAddress(listener.localAddress))) : "local";
      unitItem.processName = uniqueListeners.find((listener) => listener.processName)?.processName ?? null;
      const isCatalogUnit = matchCatalogEntry({ unit: unitItem.unit, processName: unitItem.processName }) !== null;
      unitItem.extra.isSystemService = !isCatalogUnit && uniqueListeners.length === 0;
      if (unitItem.unit === "nginx.service") unitItem.extra.siteCount = sites.length;
    }
    return [...containers, ...unitItems, ...toPortItems(unownedListeners), ...toNginxItems(sites)];
  }

  sampleAppUsage(items: readonly DiscoveredItem[]): Promise<AppUsageReading[]> {
    return this.appUsageSource.read(items);
  }

  watchLogins(options: { resumeCursor: string | null; onLoginEvent: (loginEvent: ParsedLoginEvent) => void; onCursor: (cursor: string) => void }): LoginWatchHandle {
    this.loginSource.watch(options);
    return { stop: () => this.loginSource.stop() };
  }

  async readLoginHistory(sinceTimestamp: number): Promise<ParsedLoginEvent[]> {
    return (await this.loginSource.readHistory(sinceTimestamp)).events;
  }

  async readTailnetDevices(): Promise<Map<string, string>> {
    return mapTailnetDevices(await readTailscaleStatus());
  }

  async readPublicHostname(): Promise<string> {
    return readEnvironment("PUBLIC_HOSTNAME") ?? readMagicDnsName(await readTailscaleStatus()) ?? operatingSystem.hostname();
  }

  readGpuPowerState(): Promise<GpuPowerState> {
    return readGpuPowerState();
  }

  switchGpuPowerMode(mode: GpuPowerMode): Promise<string | null> {
    return switchGpuPowerMode(mode);
  }

  readSecurityState(): Promise<SecurityState> {
    return readSecurityState();
  }

  runSecurityAction(requestId: string, action: Exclude<SecurityAction, { kind: "snapshot" }>): Promise<HostActionResult> {
    return runThroughHelper(requestId, action);
  }

  readWarnings(): string[] {
    return [...this.nginxSource.warnings];
  }

  readHostname(): string {
    return operatingSystem.hostname();
  }
}
