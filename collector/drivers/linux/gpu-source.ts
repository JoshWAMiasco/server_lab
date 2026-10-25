import { spawn, type ChildProcess } from "node:child_process";
import fileSystem from "node:fs/promises";
import path from "node:path";
import { isProgramAvailable, readIntegerFile, readTextFile, runCommand } from "@/collector/drivers/linux/run-command";
import { parseDrmVendor } from "@/collector/parsers/parse-drm-vendor";
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
  const lspciOutput = await runCommand("lspci", ["-mm", "-s", pciAddress], 3000);
  const fields = lspciOutput?.match(/"([^"]*)"/g)?.map((field) => field.slice(1, -1));
  if (fields && fields.length >= 3) return `${fields[1]} ${fields[2]}`.replace(/\s+/g, " ").trim();
  return fallbackName;
}

/**
 * Finds every GPU (any number, mixed vendors) and how to read it. Nothing is configured: GPUs come
 * and go as hardware or drivers change, because the collector re-runs this every 10 minutes.
 */
export class GpuSource {
  private devices: GpuDevice[] = [];
  private cardPathsByIndex = new Map<number, string>();
  private intelMonitor: ChildProcess | null = null;
  private intelBusyPercent: number | null = null;

  async detect(): Promise<GpuDevice[]> {
    const cards = await listDrmCards();
    const nvidiaReadings = (await isProgramAvailable("nvidia-smi")) ? parseNvidiaSmi((await runCommand("nvidia-smi", NVIDIA_QUERY)) ?? "") : [];
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
        const canUseIntelTop = await isProgramAvailable("intel_gpu_top");
        devices.push({ index, pciAddress: card.pciAddress, vendor: "intel", name: await readPciModelName(card.pciAddress, "Intel iGPU"), driver: card.driver, statsAvailable: canUseIntelTop, unavailableReason: canUseIntelTop ? undefined : "Intel iGPU detected, no stats (install intel-gpu-tools and grant CAP_PERFMON)" });
      }
      this.cardPathsByIndex.set(index, card.cardPath);
    }
    this.devices = devices;
    this.syncIntelMonitor();
    return devices;
  }

  private syncIntelMonitor(): void {
    const needsIntelMonitor = this.devices.some((device) => device.vendor === "intel" && device.statsAvailable);
    if (!needsIntelMonitor) {
      this.intelMonitor?.kill();
      this.intelMonitor = null;
      return;
    }
    if (this.intelMonitor) return;
    const monitor = spawn("intel_gpu_top", ["-J", "-s", "2000"], { stdio: ["ignore", "pipe", "ignore"] });
    let buffered = "";
    monitor.stdout.on("data", (chunk: Buffer) => {
      buffered = (buffered + chunk.toString("utf8")).slice(-20_000);
      const busyMatches = [...buffered.matchAll(/"Render\/3D[^"]*"\s*:\s*\{\s*"busy"\s*:\s*([\d.]+)/g)];
      const lastBusy = busyMatches.at(-1)?.[1];
      if (lastBusy) this.intelBusyPercent = Number(lastBusy);
    });
    monitor.on("exit", () => {
      this.intelMonitor = null;
      this.intelBusyPercent = null;
      for (const device of this.devices) {
        if (device.vendor === "intel") {
          device.statsAvailable = false;
          device.unavailableReason = "intel_gpu_top exited (it needs CAP_PERFMON, see docs/HARDENING.md)";
        }
      }
    });
    this.intelMonitor = monitor;
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
    for (const device of this.devices.filter((candidate) => candidate.vendor === "amd" && candidate.statsAvailable)) {
      const devicePath = path.join(this.cardPathsByIndex.get(device.index) ?? "", "device");
      let temperatureCelsius: number | null = null;
      try {
        const [hardwareMonitorName] = await fileSystem.readdir(path.join(devicePath, "hwmon"));
        const milliCelsius = hardwareMonitorName ? await readIntegerFile(path.join(devicePath, "hwmon", hardwareMonitorName, "temp1_input")) : null;
        temperatureCelsius = milliCelsius === null ? null : milliCelsius / 1000;
      } catch {
        temperatureCelsius = null;
      }
      readings.push({
        gpuIndex: device.index,
        vendor: "amd",
        name: device.name,
        utilizationPercent: await readIntegerFile(path.join(devicePath, "gpu_busy_percent")),
        memoryUsedBytes: await readIntegerFile(path.join(devicePath, "mem_info_vram_used")),
        memoryTotalBytes: await readIntegerFile(path.join(devicePath, "mem_info_vram_total")),
        temperatureCelsius,
        powerWatts: null,
      });
    }
    for (const device of this.devices.filter((candidate) => candidate.vendor === "intel" && candidate.statsAvailable)) {
      readings.push({ gpuIndex: device.index, vendor: "intel", name: device.name, utilizationPercent: this.intelBusyPercent, memoryUsedBytes: null, memoryTotalBytes: null, temperatureCelsius: null, powerWatts: null });
    }
    return readings;
  }

  stop(): void {
    this.intelMonitor?.kill();
  }
}
