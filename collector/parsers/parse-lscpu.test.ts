import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { describeProcessorVendor, parseLscpu, parseLscpuCacheBytes } from "./parse-lscpu";

const KIBIBYTE = 1024;
const MEBIBYTE = 1024 ** 2;

describe("parseLscpu", () => {
  test("flat output (Intel hybrid desktop)", () => {
    expect(parseLscpu(readFixture("lscpu-intel-desktop.json"))).toEqual({
      architecture: "x86_64",
      vendorIdentifier: "GenuineIntel",
      modelName: "13th Gen Intel(R) Core(TM) i7-13700K",
      socketCount: 1,
      coresPerSocket: 16,
      threadsPerCore: 2,
      logicalProcessorCount: 24,
      maximumMegahertz: 5400,
      minimumMegahertz: 800,
      virtualization: "VT-x",
      caches: [
        { level: "L1d", bytes: 640 * KIBIBYTE },
        { level: "L1i", bytes: 768 * KIBIBYTE },
        { level: "L2", bytes: 24 * MEBIBYTE },
        { level: "L3", bytes: 30 * MEBIBYTE },
      ],
    });
  });

  test("hierarchic output (AMD) reads the nested children", () => {
    const summary = parseLscpu(readFixture("lscpu-amd-hierarchic.json"));
    expect(summary).toMatchObject({
      vendorIdentifier: "AuthenticAMD",
      modelName: "AMD Ryzen 7 5700G with Radeon Graphics",
      socketCount: 1,
      coresPerSocket: 8,
      threadsPerCore: 2,
      logicalProcessorCount: 16,
      maximumMegahertz: 4672.0698,
      virtualization: "AMD-V",
    });
    expect(summary?.caches.map((cache) => cache.level)).toEqual(["L1d", "L1i", "L2", "L3"]);
    expect(summary?.caches[3]?.bytes).toBe(16 * MEBIBYTE);
  });

  test("a socket count of '-' (some ARM boards) is null", () => {
    const summary = parseLscpu(JSON.stringify({ lscpu: [{ field: "Architecture:", data: "aarch64" }, { field: "Socket(s):", data: "-" }, { field: "Core(s) per cluster:", data: "4" }] }));
    expect(summary).toMatchObject({ architecture: "aarch64", socketCount: null, coresPerSocket: 4, virtualization: null, caches: [] });
  });

  test("returns null for invalid input", () => {
    expect(parseLscpu("")).toBeNull();
    expect(parseLscpu("lscpu: failed")).toBeNull();
    expect(parseLscpu(JSON.stringify({ lscpu: [] }))).toBeNull();
  });
});

describe("parseLscpuCacheBytes", () => {
  test.each([
    ["384 KiB (12 instances)", 384 * KIBIBYTE],
    ["1 MiB (4 instances)", MEBIBYTE],
    ["32K", 32 * KIBIBYTE],
    ["8192 KB", 8 * MEBIBYTE],
    ["", null],
    [undefined, null],
  ])("%j → %j", (value, expected) => {
    expect(parseLscpuCacheBytes(value)).toBe(expected);
  });
});

describe("describeProcessorVendor", () => {
  test.each([
    ["GenuineIntel", "Intel"],
    ["AuthenticAMD", "AMD"],
    ["ARM", "ARM"],
    [null, null],
  ])("%j → %j", (vendorIdentifier, expected) => {
    expect(describeProcessorVendor(vendorIdentifier)).toBe(expected);
  });
});
