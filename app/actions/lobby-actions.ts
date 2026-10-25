"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATALOG } from "@/lib/catalog/catalog";
import { requireSession } from "@/lib/authentication/require-session";
import { getDatabase } from "@/lib/database/client";
import { writeSetting } from "@/lib/database/key-value";
import { customIconExists, storeCustomIcon } from "@/lib/lobby/custom-icon-store";
import { MAXIMUM_ICON_BYTES } from "@/lib/lobby/custom-icon-validation";
import { lobbyItems } from "@/lib/schema/lobby";
import type { ActionResult } from "@/app/actions/authentication-actions";

const KNOWN_ICON_FILE_NAMES = new Set(CATALOG.map((entry) => entry.icon).filter(Boolean));
const LOBBY_CATEGORIES = ["app", "service", "website", "database", "infra", "monitoring"] as const;

const optionalText = (maximumLength: number) =>
  z
    .string()
    .trim()
    .max(maximumLength)
    .transform((value) => value || null)
    .nullable()
    .optional();

const httpUrl = z
  .string()
  .trim()
  .transform((value) => value || null)
  .nullable()
  .optional()
  .refine((value) => !value || /^https?:\/\/[^\s]+$/i.test(value), "Use an http:// or https:// URL");

const lobbyItemSchema = z.object({
  name: optionalText(80),
  description: optionalText(300),
  url: httpUrl,
  icon: optionalText(80).refine((value) => !value || KNOWN_ICON_FILE_NAMES.has(value) || customIconExists(getDatabase(), value), "Pick an icon from the list or upload one"),
  category: z.enum(LOBBY_CATEGORIES).nullable().optional(),
  healthCheckUrl: httpUrl,
});

export type LobbyItemFormValues = z.input<typeof lobbyItemSchema>;

function readValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "value"}: ${issue.message}` : "Invalid values.";
}

function upsertOverride(key: string, values: Partial<typeof lobbyItems.$inferInsert>): void {
  const now = Date.now();
  getDatabase()
    .insert(lobbyItems)
    .values({ key, createdAt: now, updatedAt: now, ...values })
    .onConflictDoUpdate({ target: lobbyItems.key, set: { ...values, updatedAt: now } })
    .run();
}

/**
 * Saves the user's overrides for a detected item (empty fields fall back to label/catalog values).
 */
export async function saveLobbyOverride(key: string, formValues: LobbyItemFormValues): Promise<ActionResult> {
  await requireSession("/");
  const parsed = lobbyItemSchema.safeParse(formValues);
  if (!parsed.success) return { errorMessage: readValidationError(parsed.error) };
  upsertOverride(key, { name: parsed.data.name ?? null, description: parsed.data.description ?? null, url: parsed.data.url ?? null, icon: parsed.data.icon ?? null, category: parsed.data.category ?? null });
  revalidatePath("/");
  return { successMessage: "Saved." };
}

/**
 * Hides or un-hides a detected item, or a manual item (`manual:<id>`).
 */
export async function setLobbyItemHidden(key: string, isHidden: boolean): Promise<ActionResult> {
  await requireSession("/");
  if (key.startsWith("manual:")) {
    getDatabase().update(lobbyItems).set({ isHidden, updatedAt: Date.now() }).where(eq(lobbyItems.id, Number(key.slice("manual:".length)))).run();
  } else {
    upsertOverride(key, { isHidden });
  }
  revalidatePath("/");
  return { successMessage: isHidden ? "Hidden." : "Visible again." };
}

/**
 * Adds a manual item (for things ServerLab cannot detect, like an app on another machine).
 */
export async function createManualLobbyItem(formValues: LobbyItemFormValues): Promise<ActionResult> {
  await requireSession("/");
  const parsed = lobbyItemSchema.safeParse(formValues);
  if (!parsed.success) return { errorMessage: readValidationError(parsed.error) };
  if (!parsed.data.name) return { errorMessage: "name: Required" };
  const now = Date.now();
  getDatabase()
    .insert(lobbyItems)
    .values({ key: null, name: parsed.data.name, description: parsed.data.description ?? null, url: parsed.data.url ?? null, icon: parsed.data.icon ?? null, category: parsed.data.category ?? "app", healthCheckUrl: parsed.data.healthCheckUrl ?? null, createdAt: now, updatedAt: now })
    .run();
  revalidatePath("/");
  return { successMessage: "Item added." };
}

/**
 * Edits a manual item.
 */
export async function updateManualLobbyItem(lobbyItemId: number, formValues: LobbyItemFormValues): Promise<ActionResult> {
  await requireSession("/");
  const parsed = lobbyItemSchema.safeParse(formValues);
  if (!parsed.success) return { errorMessage: readValidationError(parsed.error) };
  if (!parsed.data.name) return { errorMessage: "name: Required" };
  getDatabase()
    .update(lobbyItems)
    .set({ name: parsed.data.name, description: parsed.data.description ?? null, url: parsed.data.url ?? null, icon: parsed.data.icon ?? null, category: parsed.data.category ?? "app", healthCheckUrl: parsed.data.healthCheckUrl ?? null, healthCheckState: null, updatedAt: Date.now() })
    .where(eq(lobbyItems.id, lobbyItemId))
    .run();
  revalidatePath("/");
  return { successMessage: "Saved." };
}

/**
 * Deletes a manual item.
 */
export async function deleteManualLobbyItem(lobbyItemId: number): Promise<ActionResult> {
  await requireSession("/");
  getDatabase().delete(lobbyItems).where(eq(lobbyItems.id, lobbyItemId)).run();
  revalidatePath("/");
  return { successMessage: "Deleted." };
}

/**
 * Asks the collector to run discovery now instead of waiting up to 60 s.
 */
export async function requestLobbyRescan(): Promise<ActionResult> {
  await requireSession("/");
  writeSetting(getDatabase(), "discovery.rescanRequestedAt", Date.now());
  return { successMessage: "Rescan requested. Results appear within a few seconds." };
}

/**
 * Stores an uploaded icon and returns its reference (`custom:<hash>`) for the Lobby item form.
 */
export async function uploadCustomIcon(formData: FormData): Promise<ActionResult & { iconReference?: string }> {
  await requireSession("/");
  const file = formData.get("icon");
  if (!(file instanceof File)) return { errorMessage: "Choose an image file." };
  if (file.size > MAXIMUM_ICON_BYTES) return { errorMessage: `Icons can be at most ${MAXIMUM_ICON_BYTES / 1024} KB.` };
  const result = storeCustomIcon(getDatabase(), new Uint8Array(await file.arrayBuffer()), file.name);
  if ("errorMessage" in result) return result;
  return { successMessage: "Icon uploaded.", iconReference: result.iconReference };
}
