import fileSystem from "node:fs";
import { isProgramAvailable, readTextFile, runCommand } from "@/collector/drivers/linux/run-command";
import { describeGpuPowerState, parsePrimeDiscrete } from "@/collector/parsers/parse-prime-mode";
import type { GpuPowerMode, GpuPowerState } from "@/lib/hardware/gpu-power";

/* The only units the collector may start; the polkit rule allows exactly these two. */
const UNIT_BY_MODE: Record<GpuPowerMode, string> = {
  off: "serverlab-gpu-mode@intel.service",
  "on-demand": "serverlab-gpu-mode@on-demand.service",
};
const SWITCH_TIMEOUT_MILLISECONDS = 180_000;

/**
 * The PRIME profile for the next boot (`/etc/prime-discrete`) and whether the NVIDIA driver is
 * loaded now. Needs no privileges.
 */
export async function readGpuPowerState(): Promise<GpuPowerState> {
  const [primeDiscreteText, isPrimeSelectAvailable] = await Promise.all([readTextFile("/etc/prime-discrete"), isProgramAvailable("prime-select")]);
  return describeGpuPowerState({ configuredMode: parsePrimeDiscrete(primeDiscreteText), isPrimeSelectAvailable, isNvidiaDriverLoaded: fileSystem.existsSync("/sys/module/nvidia") });
}

/**
 * Starts the root unit that runs `prime-select` for this mode and waits for it. Returns an error
 * message, or null on success.
 */
export async function switchGpuPowerMode(mode: GpuPowerMode): Promise<string | null> {
  const output = await runCommand("systemctl", ["start", "--no-ask-password", UNIT_BY_MODE[mode]], SWITCH_TIMEOUT_MILLISECONDS);
  return output === null ? `systemctl could not start ${UNIT_BY_MODE[mode]} (is the polkit rule installed? See journalctl -u ${UNIT_BY_MODE[mode]})` : null;
}
