import type { MachineFormFactor } from "@/collector/types";

/*
 * SMBIOS chassis types (DMTF DSP0134, table "System Enclosure or Chassis Types") as found in
 * /sys/class/dmi/id/chassis_type, mapped to the form factor the Machine page draws.
 */

export const CHASSIS_TYPE_DESCRIPTIONS: Readonly<Record<number, string>> = {
  1: "Other",
  2: "Unknown",
  3: "Desktop",
  4: "Low Profile Desktop",
  5: "Pizza Box",
  6: "Mini Tower",
  7: "Tower",
  8: "Portable",
  9: "Laptop",
  10: "Notebook",
  11: "Hand Held",
  12: "Docking Station",
  13: "All In One",
  14: "Sub Notebook",
  15: "Space-saving",
  16: "Lunch Box",
  17: "Main Server Chassis",
  18: "Expansion Chassis",
  19: "Sub Chassis",
  20: "Bus Expansion Chassis",
  21: "Peripheral Chassis",
  22: "RAID Chassis",
  23: "Rack Mount Chassis",
  24: "Sealed-case PC",
  25: "Multi-system",
  26: "CompactPCI",
  27: "AdvancedTCA",
  28: "Blade",
  29: "Blade Enclosing",
  30: "Tablet",
  31: "Convertible",
  32: "Detachable",
  33: "IoT Gateway",
  34: "Embedded PC",
  35: "Mini PC",
  36: "Stick PC",
};

const FORM_FACTOR_BY_CHASSIS_TYPE: Readonly<Record<number, MachineFormFactor>> = {
  3: "desktop",
  4: "desktop",
  5: "desktop",
  6: "desktop",
  7: "desktop",
  24: "desktop",
  8: "laptop",
  9: "laptop",
  10: "laptop",
  14: "laptop",
  30: "laptop",
  31: "laptop",
  32: "laptop",
  15: "mini",
  16: "mini",
  35: "mini",
  36: "mini",
  17: "server",
  23: "server",
  25: "server",
  28: "server",
  29: "server",
  13: "all-in-one",
};

export interface ChassisClassification {
  chassisType: number | null;
  formFactor: MachineFormFactor;
  description: string | null;
}

/** The chassis_type file's integer ("10\n") → form factor and SMBIOS description. Bit 7 (lock present) is ignored. */
export function parseChassisType(text: string | null): ChassisClassification {
  const code = Number.parseInt(text?.trim() ?? "", 10);
  if (!Number.isFinite(code) || code <= 0) return { chassisType: null, formFactor: "unknown", description: null };
  const chassisType = code & 0x7f;
  return { chassisType, formFactor: FORM_FACTOR_BY_CHASSIS_TYPE[chassisType] ?? "unknown", description: CHASSIS_TYPE_DESCRIPTIONS[chassisType] ?? null };
}

/** dmidecode's chassis "Type:" text ("Notebook", "Rack Mount Chassis") → the same classification. */
export function classifyChassisDescription(description: string | null): ChassisClassification {
  const normalized = description?.trim().toLowerCase().replaceAll(/[\s-]+/g, " ");
  if (!normalized) return { chassisType: null, formFactor: "unknown", description: null };
  for (const [code, knownDescription] of Object.entries(CHASSIS_TYPE_DESCRIPTIONS)) {
    if (knownDescription.toLowerCase().replaceAll(/[\s-]+/g, " ") === normalized) return parseChassisType(code);
  }
  return { chassisType: null, formFactor: "unknown", description: description?.trim() ?? null };
}
