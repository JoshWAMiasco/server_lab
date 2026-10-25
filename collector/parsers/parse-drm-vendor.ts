import type { GpuVendor } from "../types";

const VENDORS_BY_PCI_ID: Record<string, GpuVendor> = {
  "0x10de": "nvidia",
  "0x1002": "amd",
  "0x8086": "intel",
};

/* Maps the contents of /sys/class/drm/cardN/device/vendor (`0x10de\n`) to a GPU vendor, or null. */
export function parseDrmVendor(text: string): GpuVendor | null {
  let vendorId = text.trim().toLowerCase();
  if (!vendorId.startsWith("0x")) {
    vendorId = `0x${vendorId}`;
  }
  return VENDORS_BY_PCI_ID[vendorId] ?? null;
}
