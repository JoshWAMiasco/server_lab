import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { HostActionResult, SecurityAction } from "@/lib/security/security-types";

/**
 * Firewall and fail2ban changes requested on the web pages. The web process inserts a `pending`
 * row; the collector hands it to the root helper and stores the outcome. Kept as the activity log
 * shown under each page (with the exact commands that ran).
 */
export const hostActionRequests = sqliteTable(
  "host_action_requests",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    action: text("action", { mode: "json" }).$type<SecurityAction>().notNull(),
    summary: text("summary").notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] }).notNull().default("pending"),
    result: text("result", { mode: "json" }).$type<HostActionResult | null>(),
    requestedAt: integer("requested_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => [index("host_action_requests_status").on(table.status), index("host_action_requests_requested").on(table.requestedAt)],
);
