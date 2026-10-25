import type { GpuPowerState } from "../../lib/hardware/gpu-power";

/*
 * /etc/prime-discrete is written by `prime-select`: `off` for the intel profile, `on-demand`, or
 * `on` for the nvidia profile. It holds the profile for the next boot, not the current state.
 */
export function parsePrimeDiscrete(text: string | null): GpuPowerState["configuredMode"] {
  const value = text?.trim();
  if (value === "off") return "off";
  if (value === "on-demand") return "on-demand";
  if (value === "on") return "always-on";
  return null;
}

/*
 * The NVIDIA GPU is on while its kernel driver is loaded. A reboot is pending when the configured
 * profile disagrees with that: switched off but still loaded, or switched on but not loaded yet.
 */
export function describeGpuPowerState({ configuredMode, isPrimeSelectAvailable, isNvidiaDriverLoaded }: { configuredMode: GpuPowerState["configuredMode"]; isPrimeSelectAvailable: boolean; isNvidiaDriverLoaded: boolean }): GpuPowerState {
  return {
    isSupported: isPrimeSelectAvailable && configuredMode !== null,
    configuredMode,
    isPoweredOn: isNvidiaDriverLoaded,
    isRebootPending: configuredMode !== null && (configuredMode === "off") === isNvidiaDriverLoaded,
  };
}
