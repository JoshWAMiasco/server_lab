import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** SSH, console and web sign-in attempts, kept 365 d. */
export const loginEvents = sqliteTable(
  "login_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hostId: integer("host_id").notNull().default(1),
    timestamp: integer("ts").notNull(),
    channel: text("channel", { enum: ["ssh", "web", "console"] }).notNull(),
    username: text("username").notNull(),
    result: text("result", { enum: ["success", "failure", "invalid_user"] }).notNull(),
    method: text("method").notNull(),
    sourceAddress: text("src_ip"),
    sourcePort: integer("src_port"),
    countryName: text("geo_country"),
    countryCode: text("geo_country_code"),
    cityName: text("geo_city"),
    latitude: real("geo_lat"),
    longitude: real("geo_lon"),
    networkTag: text("network_tag", { enum: ["public", "lan", "tailnet"] }),
    isBackfilled: integer("backfilled", { mode: "boolean" }).notNull().default(false),
    tailnetDevice: text("tailnet_device"),
    raw: text("raw"),
    dedupeHash: text("dedupe_hash").notNull().unique(),
  },
  (table) => [index("login_events_ts").on(table.timestamp), index("login_events_src").on(table.sourceAddress)],
);
