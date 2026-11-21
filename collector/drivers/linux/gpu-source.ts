import { spawn, type ChildProcess } from "node:child_process";
import fileSystem from "node:fs/promises";
import path from "node:path";
import { isProgramAvailable, readIntegerFile, readTextFile, runCommand } from "@/collector/drivers/linux/run-command";
import { parseDrmVendor } from "@/collector/parsers/parse-drm-vendor";
import { parseLspciDeviceName } from "@/collector/parsers/parse-lspci-device";
import { normalizePciBusId, parseNvidiaSmi } from "@/collector/parsers/parse-nvidia-smi";
import type { GpuDevice, GpuReading } from "@/collector/types";

const DRM_ROOT = "/sys/class/drm";
const NVIDIA_QUERY = ["--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,pci.bus_id", "--format=csv,noheader,nounits"];

interface DrmCard {
  cardPath: string;
  pciAddress: string;
  vendor: GpuDevice["vendor"];
  driver: string | null;
}

async function listDrmCards(): Promise<DrmCard[]> {
  let entryNames: string[];
  try {
    entryNames = await fileSystem.readdir(DRM_ROOT);
  } catch {
    return [];
  }
  const cards: DrmCard[] = [];
  const seenAddresses = new Set<string>();
  for (const entryName of entryNames.filter((name) => /^card\d+$/.test(name)).sort((left, right) => Number(left.slice(4)) - Number(right.slice(4)))) {
    const devicePath = path.join(DRM_ROOT, entryName, "device");
    const vendor = parseDrmVendor((await readTextFile(path.join(devicePath, "vendor"))) ?? "");
    if (!vendor) continue;
    let pciAddress = entryName;
    let driver: string | null = null;
    try {
      pciAddress = path.basename(await fileSystem.realpath(devicePath));
      driver = path.basename(await fileSystem.realpath(path.join(devicePath, "driver")));
    } catch {
      /* No driver bound: the GPU is present but unusable for stats. */
    }
    if (seenAddresses.has(pciAddress)) continue;
    seenAddresses.add(pciAddress);
    cards.push({ cardPath: path.join(DRM_ROOT, entryName), pciAddress, vendor, driver });
  }
  return cards;
}

async function readPciModelName(pciAddress: string, fallbackName: string): Promise<string> {
  return parseLspciDeviceName((await runCommand("lspci", ["-mm", "-s", pciAddress], 3000)) ?? "") ?? fallbackName;
}

export interface EnergyCounter {
  microjoules: number;
  timestamp: number;
}

export interface GpuSensorReading {
  temperatureCelsius: number | null;
  powerWatts: number | null;
  /** The hwmon energy counter, for computing power on the next read when no power file exists. */
  energyCounter: EnergyCounter | null;
}

async function findHardwareMonitorPath(devicePath: string): Promise<string | null> {
  try {
    const entryNames = (await fileSystem.readdir(path.join(devicePath, "hwmon"))).filter((name) => /^hwmon\d+$/.test(name)).sort();
    return entryNames[0] ? path.join(devicePath, "hwmon", entryNames[0]) : null;
  } catch {
    return null;
  }
}

async function readFirstTemperature(hardwareMonitorPath: string): Promise<number | null> {
  const firstChoice = await readIntegerFile(path.join(hardwareMonitorPath, "temp1_input"));
  if (firstChoice !== null) return firstChoice;
  try {
    const inputNames = (await fileSystem.readdir(hardwareMonitorPath)).filter((name) => /^temp\d+_input$/.test(name)).sort();
    for (const inputName of inputNames) {
      const value = await readIntegerFile(path.join(hardwareMonitorPath, inputName));
      if (value !== null) return value;
    }
  } catch {
    /* Unreadable hwmon directory: no temperature. */
  }
  return null;
}

/**
 * Temperature and board power from a GPU's hwmon directory (amdgpu, and i915/xe on discrete Arc).
 * Power comes from power1_average, else power1_input (both microwatts), else the change of
 * energy1_input (microjoules) since `previousEnergy`.
 */
export async function readGpuSensors(devicePath: string, previousEnergy: EnergyCounter | null = null, now = Date.now()): Promise<GpuSensorReading> {
  const hardwareMonitorPath = await findHardwareMonitorPath(devicePath);
  if (!hardwareMonitorPath) return { temperatureCelsius: null, powerWatts: null, energyCounter: null };
  const milliCelsius = await readFirstTemperature(hardwareMonitorPath);
  const microwatts = (await readIntegerFile(path.join(hardwareMonitorPath, "power1_average"))) ?? (await readIntegerFile(path.join(hardwareMonitorPath, "power1_input")));
  const microjoules = await readIntegerFile(path.join(hardwareMonitorPath, "energy1_input"));
  const energyCounter = microjoules === null ? null : { microjoules, timestamp: now };
  let powerWatts = microwatts === null ? null : Math.round(microwatts / 10_000) / 100;
  if (powerWatts === null && energyCounter && previousEnergy && energyCounter.timestamp > previousEnergy.timestamp && energyCounter.microjoules >= previousEnergy.microjoules) {
    const watts = (energyCounter.microjoules - previousEnergy.microjoules) / (energyCounter.timestamp - previousEnergy.timestamp) / 1000;
    powerWatts = Math.round(watts * 100) / 100;
  }
  return { temperatureCelsius: milliCelsius === null ? null : milliCelsius / 1000, powerWatts, energyCounter };
}

/** VRAM from amdgpu-style mem_info_vram_total / mem_info_vram_used (also present on some discrete Intel GPUs). */
export async function readVramBytes(devicePath: string): Promise<{ memoryUsedBytes: number | null; memoryTotalBytes: number | null }> {
  const [memoryUsedBytes, memoryTotalBytes] = await Promise.all([readIntegerFile(path.join(devicePath, "mem_info_vram_used")), readIntegerFile(path.join(devicePath, "mem_info_vram_total"))]);
  return { memoryUsedBytes, memoryTotalBytes: memoryTotalBytes === 0 ? null : memoryTotalBytes };
}

/**
 * Finds every GPU (any number, mixed vendors) and how to read it. Nothing is configured: GPUs come
 * and go as hardware or drivers change, because the collector re-runs this every 10 minutes.
 */
export class GpuSource {
  private devices: GpuDevice[] = [];
  private cardPathsByIndex = new Map<number, string>();
  /** One intel_gpu_top per Intel GPU, keyed by PCI address, with its latest Render/3D busy %. */
  private intelMonitors = new Map<string, { monitor: ChildProcess; busyPercent: number | null }>();
  private energyCounters = new Map<string, EnergyCounter>();

  async detect(): Promise<GpuDevice[]> {
    const cards = await listDrmCards();
    const nvidiaReadings = (await isProgramAvailable("nvidia-smi")) ? parseNvidiaSmi((await runCommand("nvidia-smi", NVIDIA_QUERY)) ?? "") : [];
    const canUseIntelTop = cards.some((card) => card.vendor === "intel") && (await isProgramAvailable("intel_gpu_top"));
    const devices: GpuDevice[] = [];
    this.cardPathsByIndex = new Map();
    for (const card of cards) {
      const index = devices.length;
      if (card.vendor === "nvidia") {
        const reading = nvidiaReadings.find((nvidiaReading) => nvidiaReading.pciBusId === normalizePciBusId(card.pciAddress) || nvidiaReading.pciBusId === card.pciAddress);
        devices.push({
          index,
          pciAddress: card.pciAddress,
          vendor: "nvidia",
          name: reading?.name ?? (await readPciModelName(card.pciAddress, "NVIDIA GPU")),
          driver: card.driver,
          statsAvailable: Boolean(reading),
          unavailableReason: reading ? undefined : "stats unavailable: install the NVIDIA driver (e.g. sudo ubuntu-drivers install)",
        });
      } else if (card.vendor === "amd") {
        const hasBusyFile = (await readIntegerFile(path.join(card.cardPath, "device", "gpu_busy_percent"))) !== null;
        devices.push({ index, pciAddress: card.pciAddress, vendor: "amd", name: await readPciModelName(card.pciAddress, "AMD GPU"), driver: card.driver, statsAvailable: hasBusyFile, unavailableReason: hasBusyFile ? undefined : "stats unavailable: the amdgpu driver is not loaded" });
      } else {
        /* A discrete Arc reports VRAM (and hwmon temperature/power) without intel_gpu_top; utilization needs it. */
        const hasVramFile = ((await readIntegerFile(path.join(card.cardPath, "device", "mem_info_vram_total"))) ?? 0) > 0;
        const statsAvailable = canUseIntelTop || hasVramFile;
        devices.push({ index, pciAddress: card.pciAddress, vendor: "intel", name: await readPciModelName(card.pciAddress, "Intel iGPU"), driver: card.driver, statsAvailable, unavailableReason: statsAvailable ? undefined : "Intel iGPU detected, no stats (install intel-gpu-tools and grant CAP_PERFMON)" });
      }
      this.cardPathsByIndex.set(index, card.cardPath);
    }
    this.devices = devices;
    this.syncIntelMonitor(canUseIntelTop);
    return devices;
  }

  private syncIntelMonitor(canUseIntelTop: boolean): void {
    const wantedAddresses = new Set(canUseIntelTop ? this.devices.filter((device) => device.vendor === "intel" && device.statsAvailable).map((device) => device.pciAddress) : []);
    for (const [pciAddress, entry] of this.intelMonitors) {
      if (!wantedAddresses.has(pciAddress)) {
        this.intelMonitors.delete(pciAddress);
        entry.monitor.kill();
      }
    }
    for (const pciAddress of wantedAddresses) {
      if (this.intelMonitors.has(pciAddress)) continue;
      /* With one Intel GPU, intel_gpu_top's default device is it; the slot filter needs a newer igt. */
      const deviceFilter = wantedAddresses.size > 1 && /^[\da-f]{4}:[\da-f]{2}:[\da-f]{2}\.\d$/i.test(pciAddress) ? ["-d", `pci:slot=${pciAddress}`] : [];
      const monitor = spawn("intel_gpu_top", ["-J", "-s", "2000", ...deviceFilter], { stdio: ["ignore", "pipe", "ignore"] });
      const entry: { monitor: ChildProcess; busyPercent: number | null } = { monitor, busyPercent: null };
      let buffered = "";
      monitor.stdout?.on("data", (chunk: Buffer) => {
        buffered = (buffered + chunk.toString("utf8")).slice(-20_000);
        const busyMatches = [...buffered.matchAll(/"Render\/3D[^"]*"\s*:\s*\{\s*"busy"\s*:\s*([\d.]+)/g)];
        const lastBusy = busyMatches.at(-1)?.[1];
        if (lastBusy) entry.busyPercent = Number(lastBusy);
      });
      const onMonitorEnd = () => {
        if (this.intelMonitors.get(pciAddress) !== entry) return;
        this.intelMonitors.delete(pciAddress);
        for (const device of this.devices) {
          if (device.vendor === "intel" && device.pciAddress === pciAddress) {
            device.statsAvailable = false;
            device.unavailableReason = "intel_gpu_top exited (it needs CAP_PERFMON, see docs/HARDENING.md)";
          }
        }
      };
      monitor.on("error", onMonitorEnd);
      monitor.on("exit", onMonitorEnd);
      this.intelMonitors.set(pciAddress, entry);
    }
  }

  /** One reading per GPU that has stats. */
  async read(): Promise<GpuReading[]> {
    const readings: GpuReading[] = [];
    const nvidiaDevices = this.devices.filter((device) => device.vendor === "nvidia" && device.statsAvailable);
    if (nvidiaDevices.length > 0) {
      const nvidiaReadings = parseNvidiaSmi((await runCommand("nvidia-smi", NVIDIA_QUERY, 4000)) ?? "");
      for (const device of nvidiaDevices) {
        const reading = nvidiaReadings.find((nvidiaReading) => nvidiaReading.pciBusId === normalizePciBusId(device.pciAddress) || nvidiaReading.pciBusId === device.pciAddress);
        if (reading) readings.push({ ...reading, gpuIndex: device.index, vendor: "nvidia", name: device.name });
      }
    }
    const now = Date.now();
    for (const device of this.devices.filter((candidate) => candidate.vendor === "amd" && candidate.statsAvailable)) {
      const devicePath = path.join(this.cardPathsByIndex.get(device.index) ?? "", "device");
      const [sensors, vram, utilizationPercent] = await Promise.all([
        readGpuSensors(devicePath, this.energyCounters.get(device.pciAddress) ?? null, now),
        readVramBytes(devicePath),
        readIntegerFile(path.join(devicePath, "gpu_busy_percent")),
      ]);
      this.rememberEnergy(device.pciAddress, sensors.energyCounter);
      readings.push({ gpuIndex: device.index, vendor: "amd", name: device.name, utilizationPercent, ...vram, temperatureCelsius: sensors.temperatureCelsius, powerWatts: sensors.powerWatts });
    }
    for (const device of this.devices.filter((candidate) => candidate.vendor === "intel" && candidate.statsAvailable)) {
      const devicePath = path.join(this.cardPathsByIndex.get(device.index) ?? "", "device");
      const [sensors, vram] = await Promise.all([readGpuSensors(devicePath, this.energyCounters.get(device.pciAddress) ?? null, now), readVramBytes(devicePath)]);
      this.rememberEnergy(device.pciAddress, sensors.energyCounter);
      readings.push({
        gpuIndex: device.index,
        vendor: "intel",
        name: device.name,
        utilizationPercent: this.intelMonitors.get(device.pciAddress)?.busyPercent ?? null,
        ...vram,
        temperatureCelsius: sensors.temperatureCelsius,
        powerWatts: sensors.powerWatts,
      });
    }
    return readings;
  }

  private rememberEnergy(pciAddress: string, energyCounter: EnergyCounter | null): void {
    if (energyCounter) this.energyCounters.set(pciAddress, energyCounter);
    else this.energyCounters.delete(pciAddress);
  }

  stop(): void {
    for (const entry of this.intelMonitors.values()) entry.monitor.kill();
    this.intelMonitors.clear();
  }
}
