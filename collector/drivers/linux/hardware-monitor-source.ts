import fileSystem from "node:fs/promises";
import path from "node:path";
import { readIntegerFile, readTextFile } from "@/collector/drivers/linux/run-command";
import type { TemperatureReading } from "@/collector/types";

const HWMON_ROOT = "/sys/class/hwmon";
const CPU_SENSOR_DRIVERS = new Set(["coretemp", "k10temp", "zenpower", "cpu_thermal"]);
const CPU_PACKAGE_LABELS = ["Package id 0", "Tctl", "Tdie", "CPU"];
const GPU_SENSOR_DRIVERS = new Set(["amdgpu", "nouveau", "radeon", "i915", "xe"]);

export interface HardwareTemperatures {
  cpuCelsius: number | null;
  otherSensors: TemperatureReading[];
}

/**
 * Reads `/sys/class/hwmon/*` once: the CPU package temperature (coretemp `Package id 0`, k10temp
 * `Tctl`/`Tdie`) and every other sensor (NVMe, chipset, ACPI). GPU sensors are left to the GPU
 * source. VMs often have none, which gives `cpuCelsius: null`.
 */
export async function readHardwareTemperatures(): Promise<HardwareTemperatures> {
  let monitorNames: string[];
  try {
    monitorNames = await fileSystem.readdir(HWMON_ROOT);
  } catch {
    return { cpuCelsius: null, otherSensors: [] };
  }
  let cpuCelsius: number | null = null;
  let cpuFallbackCelsius: number | null = null;
  const otherSensors: TemperatureReading[] = [];
  for (const monitorName of monitorNames.sort()) {
    const monitorPath = path.join(HWMON_ROOT, monitorName);
    const driverName = (await readTextFile(path.join(monitorPath, "name")))?.trim() ?? monitorName;
    if (GPU_SENSOR_DRIVERS.has(driverName)) continue;
    let fileNames: string[];
    try {
      fileNames = await fileSystem.readdir(monitorPath);
    } catch {
      continue;
    }
    for (const inputFileName of fileNames.filter((fileName) => /^temp\d+_input$/.test(fileName)).sort()) {
      const milliCelsius = await readIntegerFile(path.join(monitorPath, inputFileName));
      if (milliCelsius === null || milliCelsius <= -40_000 || milliCelsius > 150_000) continue;
      const celsius = milliCelsius / 1000;
      const label = (await readTextFile(path.join(monitorPath, inputFileName.replace("_input", "_label"))))?.trim() ?? inputFileName.replace("_input", "");
      if (CPU_SENSOR_DRIVERS.has(driverName)) {
        if (CPU_PACKAGE_LABELS.includes(label) && cpuCelsius === null) cpuCelsius = celsius;
        cpuFallbackCelsius = Math.max(cpuFallbackCelsius ?? Number.NEGATIVE_INFINITY, celsius);
        continue;
      }
      otherSensors.push({ label: `${driverName} ${label}`, celsius });
    }
  }
  return { cpuCelsius: cpuCelsius ?? cpuFallbackCelsius, otherSensors };
}
