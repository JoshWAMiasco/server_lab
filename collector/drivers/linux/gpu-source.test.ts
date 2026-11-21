import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { readGpuSensors, readVramBytes } from "./gpu-source";

const temporaryDirectories: string[] = [];

/* Builds a fake /sys/class/drm/cardN/device tree from { "relative/path": "content" }. */
function createDeviceDirectory(files: Record<string, string>): string {
  const devicePath = mkdtempSync(path.join(tmpdir(), "serverlab-gpu-"));
  temporaryDirectories.push(devicePath);
  for (const [relativePath, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(devicePath, relativePath)), { recursive: true });
    writeFileSync(path.join(devicePath, relativePath), content);
  }
  return devicePath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("readGpuSensors", () => {
  test("amdgpu with power1_average (RDNA2 and older)", async () => {
    const devicePath = createDeviceDirectory({ "hwmon/hwmon4/temp1_input": "52000\n", "hwmon/hwmon4/power1_average": "38000000\n", "hwmon/hwmon4/power1_input": "41000000\n" });
    expect(await readGpuSensors(devicePath)).toEqual({ temperatureCelsius: 52, powerWatts: 38, energyCounter: null });
  });

  test("amdgpu with only power1_input (RDNA3)", async () => {
    const devicePath = createDeviceDirectory({ "hwmon/hwmon5/temp1_input": "47000\n", "hwmon/hwmon5/power1_input": "61234000\n" });
    expect(await readGpuSensors(devicePath)).toMatchObject({ temperatureCelsius: 47, powerWatts: 61.23 });
  });

  test("Intel Arc (i915): power from the energy counter, temperature from a later temp input", async () => {
    const devicePath = createDeviceDirectory({ "hwmon/hwmon7/energy1_input": "5000000\n", "hwmon/hwmon7/temp2_input": "44000\n" });
    const first = await readGpuSensors(devicePath, null, 10_000);
    expect(first).toEqual({ temperatureCelsius: 44, powerWatts: null, energyCounter: { microjoules: 5_000_000, timestamp: 10_000 } });
    writeFileSync(path.join(devicePath, "hwmon/hwmon7/energy1_input"), "65000000\n");
    expect((await readGpuSensors(devicePath, first.energyCounter, 12_000)).powerWatts).toBe(30);
  });

  test("no hwmon directory", async () => {
    expect(await readGpuSensors(createDeviceDirectory({ vendor: "0x8086\n" }))).toEqual({ temperatureCelsius: null, powerWatts: null, energyCounter: null });
  });
});

describe("readVramBytes", () => {
  test("reads used and total VRAM", async () => {
    const devicePath = createDeviceDirectory({ mem_info_vram_used: "1073741824\n", mem_info_vram_total: "17163091968\n" });
    expect(await readVramBytes(devicePath)).toEqual({ memoryUsedBytes: 1_073_741_824, memoryTotalBytes: 17_163_091_968 });
  });

  test("missing files (Intel iGPU) are null", async () => {
    expect(await readVramBytes(createDeviceDirectory({ vendor: "0x8086\n" }))).toEqual({ memoryUsedBytes: null, memoryTotalBytes: null });
  });
});
