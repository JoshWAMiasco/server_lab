import { createHash } from "node:crypto";
import { desc, eq, inArray, lt } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { validateIconUpload } from "@/lib/lobby/custom-icon-validation";
import { CUSTOM_ICON_PREFIX, readCustomIconId } from "@/lib/lobby/icon-reference";
import { customIcons, lobbyItems } from "@/lib/schema/lobby";

export interface CustomIconChoice {
  iconReference: string;
  name: string;
}

/**
 * Validates and stores an uploaded icon (de-duplicated by content hash) and returns its reference.
 */
export function storeCustomIcon(database: ServerLabDatabase, bytes: Uint8Array, originalName: string | null): { iconReference: string } | { errorMessage: string } {
  const validation = validateIconUpload(bytes);
  if ("errorMessage" in validation) return validation;
  const id = createHash("sha256").update(bytes).digest("hex");
  database
    .insert(customIcons)
    .values({ id, contentType: validation.contentType, bytes: Buffer.from(bytes), originalName: originalName?.slice(0, 120) ?? null, createdAt: Date.now() })
    .onConflictDoNothing()
    .run();
  return { iconReference: `${CUSTOM_ICON_PREFIX}${id}` };
}

/**
 * Whether an icon reference points at a stored upload.
 */
export function customIconExists(database: ServerLabDatabase, iconReference: string): boolean {
  const id = readCustomIconId(iconReference);
  return id !== null && Boolean(database.select({ id: customIcons.id }).from(customIcons).where(eq(customIcons.id, id)).get());
}

/**
 * One stored icon's bytes and type, or null.
 */
export function readCustomIcon(database: ServerLabDatabase, id: string): { contentType: string; bytes: Buffer } | null {
  return database.select({ contentType: customIcons.contentType, bytes: customIcons.bytes }).from(customIcons).where(eq(customIcons.id, id)).get() ?? null;
}

/**
 * Every uploaded icon, newest first, for the icon picker.
 */
export function listCustomIcons(database: ServerLabDatabase): CustomIconChoice[] {
  return database
    .select({ id: customIcons.id, originalName: customIcons.originalName })
    .from(customIcons)
    .orderBy(desc(customIcons.createdAt))
    .all()
    .map((row) => ({ iconReference: `${CUSTOM_ICON_PREFIX}${row.id}`, name: row.originalName ?? "Uploaded icon" }));
}

/**
 * Deletes uploads that no Lobby item uses and that are older than a day (a fresh upload may not be
 * saved to an item yet).
 */
export function pruneUnusedCustomIcons(database: ServerLabDatabase, now = Date.now()): number {
  const usedIds = new Set(
    database
      .select({ icon: lobbyItems.icon })
      .from(lobbyItems)
      .all()
      .map((row) => readCustomIconId(row.icon))
      .filter((id): id is string => id !== null),
  );
  const staleIds = database
    .select({ id: customIcons.id })
    .from(customIcons)
    .where(lt(customIcons.createdAt, now - 24 * 60 * 60 * 1000))
    .all()
    .map((row) => row.id)
    .filter((id) => !usedIds.has(id));
  if (staleIds.length > 0) database.delete(customIcons).where(inArray(customIcons.id, staleIds)).run();
  return staleIds.length;
}
