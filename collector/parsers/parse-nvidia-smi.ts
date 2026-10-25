import type { NvidiaGpuReading } from "../types";

/*
 * Parses `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,
 * temperature.gpu,power.draw,pci.bus_id --format=csv,noheader,nounits`.
 * `[N/A]`, `[Not Supported]` and other bracketed placeholders become null. Memory is reported in
 * MiB and converted to bytes. The PCI bus id is normalised from nvidia-smi's eight-digit domain
 * (`00000000:01:00.0`) to the sysfs form (`0000:01:00.0`) so it can be matched against
 * /sys/class/drm/card*.
 */
const MEBIBYTE = 1024 * 1024;
const COLUMN_COUNT = 8;
const PCI_BUS_ID = /^([\da-f]+):([\da-f]{2}):([\da-f]{2})\.([0-7])$/i;

function parseNullableNumber(field: string | undefined): number | null {
  const trimmed = field?.trim() ?? "";
  if (trimmed === "" || trimmed.startsWith("[") || trimmed.toUpperCase() === "N/A") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function normalizePciBusId(busId: string): string | null {
  const match = PCI_BUS_ID.exec(busId.trim());
  if (!match) {
    return null;
  }
  const [, domain = "", bus, device, functionNumber] = match;
  return `${domain.slice(-4).padStart(4, "0")}:${bus}:${device}.${functionNumber}`.toLowerCase();
}

export function parseNvidiaSmi(text: string): NvidiaGpuReading[] {
  const readings: NvidiaGpuReading[] = [];
  for (const line of text.split("\n")) {
    const fields = line.split(",").map((field) => field.trim());
    if (fields.length < COLUMN_COUNT) {
      continue;
    }
    /* A model name containing commas spans several fields; the seven others are fixed. */
    const nameFieldCount = fields.length - (COLUMN_COUNT - 1);
    const name = fields.slice(1, 1 + nameFieldCount).join(", ");
    const [utilization, memoryUsed, memoryTotal, temperature, power, busId = ""] = fields.slice(1 + nameFieldCount);
    const gpuIndex = parseNullableNumber(fields[0]);
    if (gpuIndex === null) {
      continue;
    }
    const memoryUsedMebibytes = parseNullableNumber(memoryUsed);
    const memoryTotalMebibytes = parseNullableNumber(memoryTotal);
    readings.push({
      gpuIndex,
      vendor: "nvidia",
      name,
      utilizationPercent: parseNullableNumber(utilization),
      memoryUsedBytes: memoryUsedMebibytes === null ? null : memoryUsedMebibytes * MEBIBYTE,
      memoryTotalBytes: memoryTotalMebibytes === null ? null : memoryTotalMebibytes * MEBIBYTE,
      temperatureCelsius: parseNullableNumber(temperature),
      powerWatts: parseNullableNumber(power),
      pciBusId: normalizePciBusId(busId),
    });
  }
  return readings;
}
