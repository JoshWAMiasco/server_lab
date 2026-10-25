import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { parseMeminfo } from "./parse-meminfo";

const KIBIBYTE = 1024;

describe("parseMeminfo", () => {
  test("converts kB to bytes and derives used, cached and swap", () => {
    expect(parseMeminfo(readFixture("proc-meminfo-ubuntu-24.04.txt"))).toEqual({
      totalBytes: 32_768_000 * KIBIBYTE,
      availableBytes: 20_480_000 * KIBIBYTE,
      usedBytes: (32_768_000 - 20_480_000) * KIBIBYTE,
      cachedBytes: (16_384_000 + 512_000 + 1_024_000 - 256_000) * KIBIBYTE,
      swapTotalBytes: 4_194_300 * KIBIBYTE,
      swapUsedBytes: (4_194_300 - 4_096_000) * KIBIBYTE,
    });
  });

  test("falls back to MemFree + Buffers + Cached without MemAvailable", () => {
    const text = ["MemTotal: 1000 kB", "MemFree: 100 kB", "Buffers: 50 kB", "Cached: 250 kB"].join("\n");
    const memory = parseMeminfo(text);
    expect(memory.availableBytes).toBe(400 * KIBIBYTE);
    expect(memory.usedBytes).toBe(600 * KIBIBYTE);
    expect(memory.swapTotalBytes).toBe(0);
    expect(memory.swapUsedBytes).toBe(0);
  });

  test("never reports negative cache", () => {
    const text = ["MemTotal: 1000 kB", "MemAvailable: 900 kB", "Cached: 10 kB", "Shmem: 500 kB"].join("\n");
    expect(parseMeminfo(text).cachedBytes).toBe(0);
  });
});
