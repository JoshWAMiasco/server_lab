import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Items the collector found (Docker, systemd, ports, nginx sites), upserted every 60 s. */
export const discoveredItems = sqliteTable("discovered_items", {
  key: text("key").primaryKey(),
  hostId: integer("host_id").notNull().default(1),
  source: text("source", { enum: ["docker", "systemd", "port", "nginx"] }).notNull(),
  rawName: text("raw_name").notNull(),
  image: text("image"),
  unit: text("unit"),
  processName: text("process_name"),
  description: text("description"),
  ports: text("ports", { mode: "json" }).$type<{ hostPort: number; containerPort: number | null; protocol: "tcp" | "udp"; hostAddress: string }[]>().notNull().default([]),
  labels: text("labels", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  catalogId: text("catalog_id"),
  state: text("state").notNull().default("unknown"),
  health: text("health").notNull().default("none"),
  bindScope: text("bind_scope", { enum: ["local", "tailnet", "exposed"] }).notNull().default("local"),
  viaNginxKey: text("via_nginx_key"),
  extra: text("extra", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  startedAt: integer("started_at"),
  firstSeen: integer("first_seen").notNull(),
  lastSeen: integer("last_seen").notNull(),
});

/** User-owned overrides of detected items, and manual items (`key` is NULL for manual items). */
export const lobbyItems = sqliteTable("lobby_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").unique(),
  name: text("name"),
  description: text("description"),
  url: text("url"),
  icon: text("icon"),
  category: text("category"),
  isHidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  healthCheckUrl: text("health_check_url"),
  healthCheckState: text("health_check_state"),
  healthCheckedAt: integer("health_checked_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Icons uploaded by the admin for Lobby items, stored in the database (so backups include them).
 * `id` is the SHA-256 of the bytes, which also de-duplicates uploads. A Lobby item refers to one
 * as `custom:<id>` in its `icon` column.
 */
export const customIcons = sqliteTable("custom_icons", {
  id: text("id").primaryKey(),
  contentType: text("content_type").notNull(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
  originalName: text("original_name"),
  createdAt: integer("created_at").notNull(),
});
