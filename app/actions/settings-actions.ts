"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/authentication-actions";
import { requireSession } from "@/lib/authentication/require-session";
import { getDatabase } from "@/lib/database/client";
import { readCapability, writeSetting } from "@/lib/database/key-value";
import { RETENTION_SETTING_KEY } from "@/lib/database/retention";
import { GPU_POWER_CAPABILITY_KEY, GPU_POWER_REQUEST_KEY, type GpuPowerRequest, type GpuPowerState } from "@/lib/hardware/gpu-power";
import { PUBLIC_HOSTNAME_SETTING_KEY } from "@/lib/queries/lobby-queries";
import { loginEvents } from "@/lib/schema/watcher";

const gpuPowerModeSchema = z.enum(["off", "on-demand"]);

const retentionSchema = z.object({
  rawHours: z.coerce.number().int().min(1).max(168),
  minuteRollupDays: z.coerce.number().int().min(1).max(365),
  hourRollupDays: z.coerce.number().int().min(7).max(3650),
  filesystemDays: z.coerce.number().int().min(1).max(365),
  loginDays: z.coerce.number().int().min(1).max(3650),
  alertDays: z.coerce.number().int().min(1).max(3650),
});

/**
 * Saves the host name used for Lobby links (empty = use the detected MagicDNS name).
 */
export async function savePublicHostname(hostname: string): Promise<ActionResult> {
  await requireSession("/settings");
  const trimmed = hostname.trim().toLowerCase();
  if (trimmed && !/^[a-z0-9.-]{1,253}$/.test(trimmed)) return { errorMessage: "Use a plain host name, like homelab.tail1234.ts.net." };
  writeSetting(getDatabase(), PUBLIC_HOSTNAME_SETTING_KEY, trimmed);
  revalidatePath("/", "layout");
  return { successMessage: trimmed ? `Links now use ${trimmed}.` : "Links use the detected host name." };
}

/**
 * Saves retention periods; the collector applies them at its next hourly prune.
 */
export async function saveRetention(formValues: z.input<typeof retentionSchema>): Promise<ActionResult> {
  await requireSession("/settings");
  const parsed = retentionSchema.safeParse(formValues);
  if (!parsed.success) return { errorMessage: `${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}` };
  writeSetting(getDatabase(), RETENTION_SETTING_KEY, parsed.data);
  revalidatePath("/settings");
  return { successMessage: "Retention saved. It applies at the next hourly prune." };
}

/**
 * Deletes all stored login events (IP addresses and locations are personal data).
 */
export async function purgeLoginHistory(confirmation: string): Promise<ActionResult> {
  await requireSession("/settings");
  if (confirmation !== "PURGE") return { errorMessage: 'Type "PURGE" to confirm.' };
  const { changes } = getDatabase().delete(loginEvents).run();
  revalidatePath("/watcher");
  return { successMessage: `Deleted ${changes} login events.` };
}

/**
 * Asks the collector to switch the NVIDIA GPU off (Intel graphics only) or back to on-demand.
 * Only writes a request: the collector starts the matching root unit. Applies after a reboot.
 */
export async function requestGpuPowerMode(mode: string): Promise<ActionResult> {
  await requireSession("/settings");
  const parsedMode = gpuPowerModeSchema.safeParse(mode);
  if (!parsedMode.success) return { errorMessage: "Unknown GPU mode." };
  const database = getDatabase();
  if (!readCapability<GpuPowerState | null>(database, GPU_POWER_CAPABILITY_KEY, null)?.isSupported) return { errorMessage: "GPU switching is not available on this host." };
  writeSetting(database, GPU_POWER_REQUEST_KEY, { requestId: `${Date.now()}-${parsedMode.data}`, mode: parsedMode.data, requestedAt: Date.now() } satisfies GpuPowerRequest);
  return { successMessage: parsedMode.data === "off" ? "Switching the NVIDIA GPU off. It takes effect after a reboot." : "Switching the NVIDIA GPU back on. It takes effect after a reboot." };
}
