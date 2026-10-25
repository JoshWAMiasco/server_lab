import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Collector detection results (`gpus`, `docker`, `sensors`, `journal`, …). */
export const capabilities = sqliteTable("capabilities", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** User settings (retention, hostname override, …) and collector state (journal cursor, …). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
});

/** One row; the UI shows "collector offline" when `ts` is older than 30 s. */
export const collectorHeartbeat = sqliteTable("collector_heartbeat", {
  id: integer("id").primaryKey(),
  timestamp: integer("ts").notNull(),
  version: text("version").notNull(),
  driver: text("driver").notNull(),
  hostname: text("hostname").notNull(),
});
