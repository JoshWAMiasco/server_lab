import type { ProcessorCacheSize } from "@/collector/types";

/*
 * Parses `lscpu -J`. util-linux prints either a flat list of {field, data} or, with
 * --hierarchic (the default JSON shape in some releases), the same entries nested under
 * `children` with shorter cache names ("L1d:" under "Caches (sum of all):" instead of
 * "L1d cache:"). Both are flattened, first occurrence wins.
 */

export interface LscpuSummary {
  architecture: string | null;
  /** "GenuineIntel", "AuthenticAMD", "ARM"… */
  vendorIdentifier: string | null;
  modelName: string | null;
  socketCount: number | null;
  coresPerSocket: number | null;
  threadsPerCore: number | null;
  /** Logical CPUs across all sockets ("CPU(s):"). */
  logicalProcessorCount: number | null;
  maximumMegahertz: number | null;
  minimumMegahertz: number | null;
  /** "VT-x", "AMD-V" or null. */
  virtualization: string | null;
  /** Totals across all sockets, in L1d, L1i, L2, L3 order. */
  caches: ProcessorCacheSize[];
}

interface LscpuEntry {
  field?: unknown;
  data?: unknown;
  children?: unknown;
}

const CACHE_LEVELS = ["L1d", "L1i", "L2", "L3", "L4"];
const SIZE_UNITS: Record<string, number> = { b: 1, k: 1024, kib: 1024, kb: 1024, m: 1024 ** 2, mib: 1024 ** 2, mb: 1024 ** 2, g: 1024 ** 3, gib: 1024 ** 3, gb: 1024 ** 3 };

function flattenEntries(entries: unknown, fields: Map<string, string>): void {
  if (!Array.isArray(entries)) return;
  for (const entry of entries as LscpuEntry[]) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.field === "string") {
      const key = entry.field.trim().replace(/:$/, "").replace(/ cache$/, "");
      const value = typeof entry.data === "string" ? entry.data.trim() : null;
      if (value !== null && value !== "" && value !== "-" && !fields.has(key)) fields.set(key, value);
    }
    flattenEntries(entry.children, fields);
  }
}

function parsePositiveNumber(value: string | undefined): number | null {
  const number = Number.parseFloat(value ?? "");
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parsePositiveInteger(value: string | undefined): number | null {
  const number = parsePositiveNumber(value);
  return number === null ? null : Math.round(number);
}

/** "384 KiB (12 instances)", "32 MiB", "32K" (older util-linux, per core) → bytes. */
export function parseLscpuCacheBytes(value: string | undefined): number | null {
  const match = /^([\d.]+)\s*([a-z]+)?/i.exec(value?.trim() ?? "");
  if (!match) return null;
  const multiplier = SIZE_UNITS[(match[2] ?? "b").toLowerCase()];
  if (!multiplier) return null;
  const bytes = Math.round(Number(match[1]) * multiplier);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
}

export function parseLscpu(jsonText: string): LscpuSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const entries = (parsed as { lscpu?: unknown } | null)?.lscpu;
  if (!Array.isArray(entries)) return null;
  const fields = new Map<string, string>();
  flattenEntries(entries, fields);
  if (fields.size === 0) return null;
  const caches: ProcessorCacheSize[] = [];
  for (const level of CACHE_LEVELS) {
    const bytes = parseLscpuCacheBytes(fields.get(level));
    if (bytes !== null) caches.push({ level, bytes });
  }
  return {
    architecture: fields.get("Architecture") ?? null,
    vendorIdentifier: fields.get("Vendor ID") ?? null,
    modelName: fields.get("Model name") ?? null,
    socketCount: parsePositiveInteger(fields.get("Socket(s)")),
    coresPerSocket: parsePositiveInteger(fields.get("Core(s) per socket") ?? fields.get("Core(s) per cluster")),
    threadsPerCore: parsePositiveInteger(fields.get("Thread(s) per core")),
    logicalProcessorCount: parsePositiveInteger(fields.get("CPU(s)")),
    maximumMegahertz: parsePositiveNumber(fields.get("CPU max MHz")),
    minimumMegahertz: parsePositiveNumber(fields.get("CPU min MHz")),
    virtualization: fields.get("Virtualization") ?? null,
    caches,
  };
}

/** "GenuineIntel" → "Intel", "AuthenticAMD" → "AMD"; anything else as printed. */
export function describeProcessorVendor(vendorIdentifier: string | null): string | null {
  if (!vendorIdentifier) return null;
  if (vendorIdentifier === "GenuineIntel") return "Intel";
  if (vendorIdentifier === "AuthenticAMD") return "AMD";
  return vendorIdentifier;
}
