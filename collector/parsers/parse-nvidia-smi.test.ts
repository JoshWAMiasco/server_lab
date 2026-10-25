import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { normalizePciBusId, parseNvidiaSmi } from "./parse-nvidia-smi";

const MEBIBYTE = 1024 * 1024;

describe("parseNvidiaSmi", () => {
  const readings = parseNvidiaSmi(readFixture("nvidia-smi-query-gpu.csv"));

  test("reads one GPU per line and converts MiB to bytes", () => {
    expect(readings).toHaveLength(3);
    expect(readings[0]).toEqual({
      gpuIndex: 0,
      vendor: "nvidia",
      name: "NVIDIA GeForce RTX 3060",
      utilizationPercent: 7,
      memoryUsedBytes: 1243 * MEBIBYTE,
      memoryTotalBytes: 12_288 * MEBIBYTE,
      temperatureCelsius: 46,
      powerWatts: 31.42,
      pciBusId: "0000:01:00.0",
    });
  });

  test("turns [N/A] and [Not Supported] into null", () => {
    expect(readings[1]).toMatchObject({ name: "Tesla P4", utilizationPercent: null, powerWatts: null, memoryUsedBytes: 0 });
    expect(readings[2]).toMatchObject({ powerWatts: null, pciBusId: "0000:0a:00.0" });
  });

  test("keeps commas inside a model name", () => {
    const [reading] = parseNvidiaSmi("0, Quadro RTX 4000, Max-Q, 3, 100, 8192, 40, 12.5, 00000000:3B:00.0");
    expect(reading).toMatchObject({ name: "Quadro RTX 4000, Max-Q", utilizationPercent: 3, pciBusId: "0000:3b:00.0" });
  });

  test("ignores blank lines and error output", () => {
    expect(parseNvidiaSmi("\nNVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver.\n")).toEqual([]);
  });
});

describe("normalizePciBusId", () => {
  test("shortens the domain to four digits and lowercases", () => {
    expect(normalizePciBusId("00000000:0A:00.0")).toBe("0000:0a:00.0");
    expect(normalizePciBusId("0000:01:00.1")).toBe("0000:01:00.1");
    expect(normalizePciBusId("[N/A]")).toBeNull();
  });
});
