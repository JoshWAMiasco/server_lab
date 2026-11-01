import { desc, ne } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { readCapability } from "@/lib/database/key-value";
import { hostActionRequests } from "@/lib/schema/security";
import { SECURITY_CAPABILITY_KEY, type HostActionResult, type SecurityAction, type SecurityState } from "@/lib/security/security-types";

export interface SecurityActivityEntry {
  id: string;
  kind: SecurityAction["kind"];
  summary: string;
  status: "pending" | "running" | "done" | "failed";
  result: HostActionResult | null;
  requestedAt: number;
  finishedAt: number | null;
}

export interface SecurityOverview {
  state: SecurityState | null;
  activity: SecurityActivityEntry[];
}

const ACTIVITY_LIMIT = 25;

/**
 * The latest UFW / fail2ban state the collector published, and recent changes made from the pages.
 * `area` keeps each page's activity log to its own tool.
 */
export function readSecurityOverview(database: ServerLabDatabase, area: "firewall" | "fail2ban"): SecurityOverview {
  const rows = database.select().from(hostActionRequests).where(ne(hostActionRequests.kind, "snapshot")).orderBy(desc(hostActionRequests.requestedAt)).limit(ACTIVITY_LIMIT * 2).all();
  const activity = rows
    .filter((row) => row.kind.startsWith(area))
    .slice(0, ACTIVITY_LIMIT)
    .map((row) => ({ id: row.id, kind: row.action.kind, summary: row.summary, status: row.status, result: row.result ?? null, requestedAt: row.requestedAt, finishedAt: row.finishedAt }));
  return { state: readCapability<SecurityState | null>(database, SECURITY_CAPABILITY_KEY, null), activity };
}
