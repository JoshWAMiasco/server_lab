import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createGpuPowerJob } from "@/collector/jobs/gpu-power-job";
import type { ServerLabDatabase } from "@/lib/database/client";
import { readCapability, readSetting, writeSetting } from "@/lib/database/key-value";
import { GPU_POWER_CAPABILITY_KEY, GPU_POWER_REQUEST_KEY, GPU_POWER_RESULT_KEY, type GpuPowerMode, type GpuPowerResult, type GpuPowerState } from "@/lib/hardware/gpu-power";
import { createTemporaryDatabase } from "@/lib/testing/temporary-database";

function createFakeDriver(switchError: string | null = null) {
  const switchedModes: GpuPowerMode[] = [];
  let configuredMode: GpuPowerMode = "on-demand";
  return {
    switchedModes,
    readGpuPowerState: async (): Promise<GpuPowerState> => ({ isSupported: true, configuredMode, isPoweredOn: true, isRebootPending: configuredMode === "off" }),
    switchGpuPowerMode: async (mode: GpuPowerMode) => {
      switchedModes.push(mode);
      if (!switchError) configuredMode = mode;
      return switchError;
    },
  };
}

describe("createGpuPowerJob", () => {
  let database: ServerLabDatabase;
  let remove: () => void;
  beforeEach(() => ({ database, remove } = createTemporaryDatabase()));
  afterEach(() => remove());

  test("publishes the state for the web process", async () => {
    await createGpuPowerJob(database, createFakeDriver())();
    expect(readCapability<GpuPowerState | null>(database, GPU_POWER_CAPABILITY_KEY, null)).toMatchObject({ isSupported: true, configuredMode: "on-demand" });
  });

  test("switches once per request and records the result and new state", async () => {
    const driver = createFakeDriver();
    const runJob = createGpuPowerJob(database, driver);
    writeSetting(database, GPU_POWER_REQUEST_KEY, { requestId: "1-off", mode: "off", requestedAt: 1 });
    await runJob();
    await runJob();
    expect(driver.switchedModes).toEqual(["off"]);
    expect(readSetting<GpuPowerResult | null>(database, GPU_POWER_RESULT_KEY, null)).toMatchObject({ requestId: "1-off", mode: "off", isSuccessful: true, errorMessage: null });
    expect(readCapability<GpuPowerState | null>(database, GPU_POWER_CAPABILITY_KEY, null)).toMatchObject({ configuredMode: "off", isRebootPending: true });
  });

  test("records a failed switch", async () => {
    const runJob = createGpuPowerJob(database, createFakeDriver("polkit said no"));
    writeSetting(database, GPU_POWER_REQUEST_KEY, { requestId: "2-off", mode: "off", requestedAt: 2 });
    await runJob();
    expect(readSetting<GpuPowerResult | null>(database, GPU_POWER_RESULT_KEY, null)).toMatchObject({ isSuccessful: false, errorMessage: "polkit said no" });
  });

  test("ignores a request for a mode it does not know", async () => {
    const driver = createFakeDriver();
    writeSetting(database, GPU_POWER_REQUEST_KEY, { requestId: "3-x", mode: "nvidia", requestedAt: 3 });
    await createGpuPowerJob(database, driver)();
    expect(driver.switchedModes).toEqual([]);
  });

  test("does nothing on drivers without GPU switching", async () => {
    await createGpuPowerJob(database, {})();
    expect(readCapability<GpuPowerState | null>(database, GPU_POWER_CAPABILITY_KEY, null)).toBeNull();
  });
});
