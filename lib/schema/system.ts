import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

/**
 * One row per kernel boot, keyed by /proc/sys/kernel/random/boot_id. `endKind` says how the boot
 * ended (null while it is the current one). `streakStartedAt` is when the current uptime streak
 * began: a reboot carries the previous boot's streak forward, a shutdown or crash starts a new one.
 */
export const bootSessions = sqliteTable(
  "boot_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hostId: integer("host_id").notNull().default(1),
    bootId: text("boot_id").notNull().unique(),
    bootedAt: integer("booted_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    endedAt: integer("ended_at"),
    endKind: text("end_kind").$type<"reboot" | "shutdown" | "crash">(),
    streakStartedAt: integer("streak_started_at").notNull(),
  },
  (table) => [index("boot_sessions_booted_at").on(table.bootedAt)],
);
