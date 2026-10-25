import type { MemoryInformation } from "../types";

const MEMINFO_LINE = /^([\w()]+):\s+(\d+)(\s+kB)?/;
const KIBIBYTE = 1024;

/*
 * Parses /proc/meminfo into bytes. "Used" excludes reclaimable cache, like `free`: MemTotal minus
 * MemAvailable (falling back to MemFree + Buffers + Cached on kernels without MemAvailable).
 * "Cached" is Cached + Buffers + SReclaimable − Shmem, since shared memory (tmpfs) cannot be dropped.
 */
export function parseMeminfo(text: string): MemoryInformation {
  const values = new Map<string, number>();
  for (const line of text.split("\n")) {
    const match = MEMINFO_LINE.exec(line.trim());
    if (!match?.[1]) {
      continue;
    }
    values.set(match[1], Number(match[2]) * (match[3] ? KIBIBYTE : 1));
  }
  const read = (key: string): number => values.get(key) ?? 0;

  const totalBytes = read("MemTotal");
  const availableBytes = values.has("MemAvailable")
    ? read("MemAvailable")
    : read("MemFree") + read("Buffers") + read("Cached");
  const swapTotalBytes = read("SwapTotal");

  return {
    totalBytes,
    availableBytes,
    usedBytes: Math.max(0, totalBytes - availableBytes),
    cachedBytes: Math.max(0, read("Cached") + read("Buffers") + read("SReclaimable") - read("Shmem")),
    swapTotalBytes,
    swapUsedBytes: Math.max(0, swapTotalBytes - read("SwapFree")),
  };
}
