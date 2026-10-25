import { eq } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { capabilities, settings } from "@/lib/schema/system";

/**
 * Reads a JSON value from the `settings` table, or `fallback` when it is not set.
 */
export function readSetting<ValueType>(database: ServerLabDatabase, key: string, fallback: ValueType): ValueType {
  const row = database.select().from(settings).where(eq(settings.key, key)).get();
  return row ? (row.value as ValueType) : fallback;
}

/**
 * Writes a JSON value to the `settings` table.
 */
export function writeSetting(database: ServerLabDatabase, key: string, value: unknown): void {
  database.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

/**
 * Reads a detection result written by the collector, or `fallback`.
 */
export function readCapability<ValueType>(database: ServerLabDatabase, key: string, fallback: ValueType): ValueType {
  const row = database.select().from(capabilities).where(eq(capabilities.key, key)).get();
  return row ? (row.value as ValueType) : fallback;
}

/**
 * Writes a detection result.
 */
export function writeCapability(database: ServerLabDatabase, key: string, value: unknown): void {
  const updatedAt = Date.now();
  database.insert(capabilities).values({ key, value, updatedAt }).onConflictDoUpdate({ target: capabilities.key, set: { value, updatedAt } }).run();
}
