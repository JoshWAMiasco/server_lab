import type { StorageDevice, StorageKind } from "@/collector/types";

/*
 * Parses `lsblk -J -b -d -o NAME,MODEL,VENDOR,SERIAL,SIZE,ROTA,TRAN,TYPE,REV` into physical disks.
 * Older util-linux (Ubuntu 22.04) prints numbers and booleans as strings ("1", "0"); newer prints
 * real JSON numbers and booleans. Model and vendor come space-padded ("ATA     ").
 */

interface LsblkDevice {
  name?: unknown;
  model?: unknown;
  vendor?: unknown;
  serial?: unknown;
  size?: unknown;
  rota?: unknown;
  tran?: unknown;
  type?: unknown;
  rev?: unknown;
}

const VIRTUAL_DEVICE_NAME = /^(?:loop|zram|ram|dm-|md|sr|fd|nbd)\d*/;

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === 1) return true;
  if (value === "0" || value === 0) return false;
  return null;
}

function readSize(value: unknown): number {
  const size = typeof value === "number" ? value : Number(typeof value === "string" ? value.trim() : Number.NaN);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

/** NVMe and USB by transport, otherwise SSD or HDD by the rotational flag. */
export function classifyStorageKind(transport: string | null, isRotational: boolean | null): StorageKind {
  if (transport === "nvme") return "nvme";
  if (transport === "usb") return "usb";
  if (isRotational === false) return "ssd";
  if (isRotational === true) return "hdd";
  return "other";
}

export function parseLsblk(jsonText: string): StorageDevice[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const devices = (parsed as { blockdevices?: unknown } | null)?.blockdevices;
  if (!Array.isArray(devices)) return [];
  const storage: StorageDevice[] = [];
  for (const device of devices as LsblkDevice[]) {
    const name = readText(device?.name);
    if (!name || readText(device.type) !== "disk" || VIRTUAL_DEVICE_NAME.test(name)) continue;
    const sizeBytes = readSize(device.size);
    if (sizeBytes === 0) continue;
    const transport = readText(device.tran)?.toLowerCase() ?? null;
    storage.push({
      name,
      model: readText(device.model),
      vendor: readText(device.vendor),
      serialNumber: readText(device.serial),
      sizeBytes,
      kind: classifyStorageKind(transport, readBoolean(device.rota)),
      transport,
      revision: readText(device.rev),
    });
  }
  return storage;
}
