import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type AlertChannel = "ntfy" | "discord" | "telegram" | "inapp";

/** Threshold and event alert rules (seeded with defaults, editable). */
export const alertRules = sqliteTable("alert_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["threshold", "event"] }).notNull(),
  metric: text("metric"),
  entity: text("entity"),
  operator: text("op", { enum: [">", "<"] }),
  threshold: real("threshold"),
  forSeconds: integer("for_s").notNull().default(0),
  event: text("event"),
  parameters: text("params", { mode: "json" }).$type<Record<string, number | string>>().notNull().default({}),
  cooldownSeconds: integer("cooldown_s").notNull().default(1800),
  channels: text("channels", { mode: "json" }).$type<AlertChannel[]>().notNull().default(["inapp"]),
  isEnabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  seedKey: text("seed_key").unique(),
});

/** Every firing (and its resolution), kept 90 d. */
export const alertEvents = sqliteTable(
  "alert_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hostId: integer("host_id").notNull().default(1),
    ruleId: integer("rule_id").references(() => alertRules.id, { onDelete: "set null" }),
    ruleName: text("rule_name").notNull(),
    entity: text("entity").notNull().default(""),
    state: text("state", { enum: ["firing", "resolved"] }).notNull(),
    value: real("value"),
    message: text("message").notNull(),
    startedAt: integer("started_at").notNull(),
    resolvedAt: integer("resolved_at"),
    notifiedAt: integer("notified_at"),
    isAcknowledged: integer("acknowledged", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [index("alert_events_started").on(table.startedAt), index("alert_events_state").on(table.state)],
);
