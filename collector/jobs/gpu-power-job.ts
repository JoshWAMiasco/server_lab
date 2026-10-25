import type { CollectorDriver } from "@/collector/driver";
import type { ServerLabDatabase } from "@/lib/database/client";
import { readSetting, writeCapability, writeSetting } from "@/lib/database/key-value";
import { GPU_POWER_CAPABILITY_KEY, GPU_POWER_MODES, GPU_POWER_REQUEST_KEY, GPU_POWER_RESULT_KEY, type GpuPowerRequest, type GpuPowerResult } from "@/lib/hardware/gpu-power";

/**
 * Publishes the GPU power state (written only when it changes) and carries out a switch the
 * Settings page requested, once per request id. The web process has no privileges, so the
 * switch always goes through here.
 */
export function createGpuPowerJob(database: ServerLabDatabase, driver: Pick<CollectorDriver, "readGpuPowerState" | "switchGpuPowerMode">): () => Promise<void> {
  let publishedStateText = "";
  const publishState = async () => {
    if (!driver.readGpuPowerState) return;
    const stateText = JSON.stringify(await driver.readGpuPowerState());
    if (stateText === publishedStateText) return;
    writeCapability(database, GPU_POWER_CAPABILITY_KEY, JSON.parse(stateText));
    publishedStateText = stateText;
  };

  return async () => {
    await publishState();
    const request = readSetting<GpuPowerRequest | null>(database, GPU_POWER_REQUEST_KEY, null);
    const lastResult = readSetting<GpuPowerResult | null>(database, GPU_POWER_RESULT_KEY, null);
    if (!request || !driver.switchGpuPowerMode || lastResult?.requestId === request.requestId || !GPU_POWER_MODES.includes(request.mode)) return;
    const errorMessage = await driver.switchGpuPowerMode(request.mode);
    writeSetting(database, GPU_POWER_RESULT_KEY, { requestId: request.requestId, mode: request.mode, isSuccessful: errorMessage === null, errorMessage, finishedAt: Date.now() } satisfies GpuPowerResult);
    await publishState();
  };
}
