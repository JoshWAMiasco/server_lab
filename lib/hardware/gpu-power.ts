/*
 * Switching an NVIDIA GPU between "off" (PRIME `intel` profile: Intel graphics only, the NVIDIA GPU
 * is powered down) and "on-demand" on hybrid-graphics laptops. The web process only writes a
 * request; the collector starts one of two fixed root units (deploy/serverlab-gpu-mode@.service),
 * which a polkit rule lets the serverlab user start. prime-select applies at the next boot.
 */

export type GpuPowerMode = "off" | "on-demand";

export const GPU_POWER_MODES: readonly GpuPowerMode[] = ["off", "on-demand"];
export const GPU_POWER_CAPABILITY_KEY = "gpuPower";
export const GPU_POWER_REQUEST_KEY = "gpuPower.request";
export const GPU_POWER_RESULT_KEY = "gpuPower.result";

export interface GpuPowerState {
  isSupported: boolean;
  configuredMode: GpuPowerMode | "always-on" | null;
  isPoweredOn: boolean;
  isRebootPending: boolean;
}

export interface GpuPowerRequest {
  requestId: string;
  mode: GpuPowerMode;
  requestedAt: number;
}

export interface GpuPowerResult {
  requestId: string;
  mode: GpuPowerMode;
  isSuccessful: boolean;
  errorMessage: string | null;
  finishedAt: number;
}
