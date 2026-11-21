import type { MemoryModule } from "@/collector/types";

/*
 * Parses `dmidecode` text output (as written by serverlab-hardware-inventory.service). Each
 * "Handle 0x…, DMI type N, M bytes" block becomes one handle: a name line, `Key: value` properties
 * and list properties (a `Key:` line followed by deeper-indented items, e.g. "Characteristics:").
 */

export interface DmidecodeHandle {
  handle: string;
  type: number;
  name: string;
  properties: Map<string, string>;
  listProperties: Map<string, string[]>;
}

export interface DmidecodeMemoryArray {
  slotCount: number | null;
  maximumCapacityBytes: number | null;
  errorCorrection: string | null;
}

export interface DmidecodeSystemInformation {
  system: { vendor: string | null; product: string | null; version: string | null; serialNumber: string | null };
  motherboard: { vendor: string | null; model: string | null; version: string | null; serialNumber: string | null };
  bios: { vendor: string | null; version: string | null; releaseDate: string | null };
  chassis: { vendor: string | null; typeDescription: string | null; serialNumber: string | null };
}

export interface DmidecodeProcessor {
  socket: string | null;
  manufacturer: string | null;
  version: string | null;
  maximumMegahertz: number | null;
  currentMegahertz: number | null;
  coreCount: number | null;
  threadCount: number | null;
}

const HANDLE_HEADER = /^Handle (0x[\da-f]+), DMI type (\d+), \d+ bytes/i;

const PLACEHOLDER_VALUES = new Set(
  [
    "",
    "unknown",
    "not specified",
    "not provided",
    "not available",
    "not present",
    "not installed",
    "no module installed",
    "to be filled by o.e.m.",
    "to be filled by oem",
    "default string",
    "system manufacturer",
    "system product name",
    "system version",
    "system serial number",
    "base board manufacturer",
    "base board product name",
    "base board version",
    "base board serial number",
    "chassis manufacturer",
    "chassis version",
    "chassis serial number",
    "0123456789",
    "123456789",
    "n/a",
    "na",
    "none",
    "undefined",
    "empty",
    "o.e.m.",
    "oem",
  ].map((value) => value.toLowerCase()),
);

/*
 * JEDEC JEP106 codes that some BIOSes print instead of the manufacturer name (the first byte pair
 * of e.g. "80AD000080AD"). Only the common memory makers; anything else is shown as printed.
 */
const JEDEC_MEMORY_MANUFACTURERS: Record<string, string> = {
  "80AD": "SK Hynix",
  "00AD": "SK Hynix",
  "00CE": "Samsung",
  "002C": "Micron",
  "80CE": "Samsung",
  "802C": "Micron",
  "859B": "Crucial",
  "0198": "Kingston",
  "04CD": "G.Skill",
  "029E": "Corsair",
  "0443": "Ramaxel",
  "8551": "Qimonda",
  "8A76": "Lexar",
  "0D9B": "Crucial",
  "04CB": "A-DATA",
  "01BA": "PNY",
  "0B87": "Teamgroup",
  "851A": "Nanya",
  "830B": "Nanya",
};

/** Turns the BIOS's placeholder strings ("Not Specified", "To Be Filled By O.E.M.", all zeros…) into null. */
export function cleanDmidecodeValue(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  if (/^[0\s.]+$/.test(trimmed) || /^[f\s]+$/i.test(trimmed)) return null;
  return trimmed;
}

export function parseDmidecode(text: string): DmidecodeHandle[] {
  const handles: DmidecodeHandle[] = [];
  let current: DmidecodeHandle | null = null;
  let expectingName = false;
  let openListKey: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const headerMatch = HANDLE_HEADER.exec(rawLine);
    if (headerMatch) {
      current = { handle: (headerMatch[1] ?? "").toLowerCase(), type: Number(headerMatch[2]), name: "", properties: new Map(), listProperties: new Map() };
      handles.push(current);
      expectingName = true;
      openListKey = null;
      continue;
    }
    if (!current) continue;
    if (rawLine.trim() === "") {
      openListKey = null;
      continue;
    }
    const indentation = /^\t*/.exec(rawLine)?.[0].length ?? 0;
    const spaceIndentation = indentation === 0 ? (/^ */.exec(rawLine)?.[0].length ?? 0) : 0;
    const depth = indentation > 0 ? indentation : Math.floor(spaceIndentation / 8);
    const line = rawLine.trim();
    if (expectingName && depth === 0) {
      current.name = line;
      expectingName = false;
      continue;
    }
    expectingName = false;
    if (depth >= 2 && openListKey) {
      current.listProperties.get(openListKey)?.push(line);
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (value === "") {
      openListKey = key;
      current.listProperties.set(key, []);
    } else {
      openListKey = null;
      current.properties.set(key, value);
    }
  }
  return handles;
}

/** "16 GB", "8192 MB", "512 kB", "2 TB" → bytes (binary units, as dmidecode means them); null for an empty slot. */
export function parseDmidecodeSizeBytes(value: string | undefined): number | null {
  const match = /^([\d.]+)\s*(bytes|kb|mb|gb|tb)\b/i.exec(value?.trim() ?? "");
  if (!match) return null;
  const amount = Number(match[1]);
  const exponent = ["bytes", "kb", "mb", "gb", "tb"].indexOf((match[2] ?? "").toLowerCase());
  const bytes = Math.round(amount * 1024 ** exponent);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
}

/** "5600 MT/s" or "2400 MHz" (older dmidecode) → 5600 / 2400; "Unknown" → null. */
export function parseDmidecodeSpeed(value: string | undefined): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*(mt\/s|mhz|ghz)\b/i.exec(value?.trim() ?? "");
  if (!match) return null;
  const speed = match[2]?.toLowerCase() === "ghz" ? Number(match[1]) * 1000 : Number(match[1]);
  return speed > 0 ? Math.round(speed) : null;
}

function parseCount(value: string | undefined): number | null {
  const count = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function resolveManufacturer(value: string | undefined): string | null {
  const cleaned = cleanDmidecodeValue(value);
  if (!cleaned) return null;
  const hexMatch = /^(?:0x)?([\da-f]{4})(?:[\da-f]{4})*$/i.exec(cleaned.replaceAll(" ", ""));
  if (hexMatch) return JEDEC_MEMORY_MANUFACTURERS[(hexMatch[1] ?? "").toUpperCase()] ?? cleaned;
  return cleaned;
}

function memoryArrayHandles(handles: readonly DmidecodeHandle[]): DmidecodeHandle[] {
  return handles.filter((handle) => handle.type === 16 && (handle.properties.get("Use") ?? "System Memory").toLowerCase() === "system memory");
}

/**
 * Every type-17 "Memory Device" in the system-memory arrays: filled slots first, then empty ones,
 * each group in dmidecode's (physical) order.
 */
export function extractMemoryModules(handles: readonly DmidecodeHandle[]): MemoryModule[] {
  const systemArrays = new Set(memoryArrayHandles(handles).map((handle) => handle.handle));
  const modules: MemoryModule[] = [];
  for (const handle of handles) {
    if (handle.type !== 17) continue;
    const arrayHandle = handle.properties.get("Array Handle")?.toLowerCase();
    if (systemArrays.size > 0 && arrayHandle && !systemArrays.has(arrayHandle)) continue;
    const sizeBytes = parseDmidecodeSizeBytes(handle.properties.get("Size") ?? handle.properties.get("Volatile Size"));
    const isInstalled = sizeBytes !== null;
    modules.push({
      slot: cleanDmidecodeValue(handle.properties.get("Locator")) ?? `Slot ${modules.length + 1}`,
      bank: cleanDmidecodeValue(handle.properties.get("Bank Locator")),
      sizeBytes,
      type: isInstalled ? cleanDmidecodeValue(handle.properties.get("Type")) : null,
      formFactor: cleanDmidecodeValue(handle.properties.get("Form Factor")),
      speedMegatransfers: isInstalled ? parseDmidecodeSpeed(handle.properties.get("Speed")) : null,
      configuredSpeedMegatransfers: isInstalled ? parseDmidecodeSpeed(handle.properties.get("Configured Memory Speed") ?? handle.properties.get("Configured Clock Speed")) : null,
      manufacturer: isInstalled ? resolveManufacturer(handle.properties.get("Manufacturer")) : null,
      partNumber: isInstalled ? cleanDmidecodeValue(handle.properties.get("Part Number")) : null,
      serialNumber: isInstalled ? cleanDmidecodeValue(handle.properties.get("Serial Number")) : null,
    });
  }
  return [...modules.filter((module) => module.sizeBytes !== null), ...modules.filter((module) => module.sizeBytes === null)];
}

/** The type-16 "Physical Memory Array"s used for system memory, summed (a 2-socket server has one per socket). */
export function extractMemoryArray(handles: readonly DmidecodeHandle[]): DmidecodeMemoryArray {
  const arrays = memoryArrayHandles(handles);
  if (arrays.length === 0) return { slotCount: null, maximumCapacityBytes: null, errorCorrection: null };
  const slotCounts = arrays.map((handle) => parseCount(handle.properties.get("Number Of Devices")));
  const capacities = arrays.map((handle) => parseDmidecodeSizeBytes(handle.properties.get("Maximum Capacity")));
  return {
    slotCount: slotCounts.every((count) => count !== null) ? slotCounts.reduce<number>((total, count) => total + (count ?? 0), 0) : null,
    maximumCapacityBytes: capacities.every((capacity) => capacity !== null) ? capacities.reduce<number>((total, capacity) => total + (capacity ?? 0), 0) : null,
    errorCorrection: cleanDmidecodeValue(arrays[0]?.properties.get("Error Correction Type")),
  };
}

/** BIOS (type 0), system (1), baseboard (2) and chassis (3) identity; placeholders become null. */
export function extractSystemInformation(handles: readonly DmidecodeHandle[]): DmidecodeSystemInformation {
  const read = (type: number, key: string) => cleanDmidecodeValue(handles.find((handle) => handle.type === type)?.properties.get(key));
  return {
    system: { vendor: read(1, "Manufacturer"), product: read(1, "Product Name"), version: read(1, "Version"), serialNumber: read(1, "Serial Number") },
    motherboard: { vendor: read(2, "Manufacturer"), model: read(2, "Product Name"), version: read(2, "Version"), serialNumber: read(2, "Serial Number") },
    bios: { vendor: read(0, "Vendor"), version: read(0, "Version"), releaseDate: read(0, "Release Date") },
    chassis: { vendor: read(3, "Manufacturer"), typeDescription: read(3, "Type"), serialNumber: read(3, "Serial Number") },
  };
}

/** Populated type-4 processor sockets in order. */
export function extractProcessors(handles: readonly DmidecodeHandle[]): DmidecodeProcessor[] {
  return handles
    .filter((handle) => handle.type === 4)
    .filter((handle) => {
      const status = handle.properties.get("Status")?.toLowerCase() ?? "populated";
      return !status.includes("unpopulated");
    })
    .map((handle) => ({
      socket: cleanDmidecodeValue(handle.properties.get("Socket Designation")),
      manufacturer: cleanDmidecodeValue(handle.properties.get("Manufacturer")),
      version: cleanDmidecodeValue(handle.properties.get("Version")),
      maximumMegahertz: parseDmidecodeSpeed(handle.properties.get("Max Speed")),
      currentMegahertz: parseDmidecodeSpeed(handle.properties.get("Current Speed")),
      coreCount: parseCount(handle.properties.get("Core Count")),
      threadCount: parseCount(handle.properties.get("Thread Count")),
    }));
}
