"use server";

import { requireSession } from "@/lib/authentication/require-session";
import { getDatabase } from "@/lib/database/client";
import { readRollupSeries, type HistorySeries } from "@/lib/queries/history-queries";

/**
 * Memory and CPU history of one app (Applications drill-down).
 */
export async function readAppHistory(appKey: string, range: "24h" | "7d" | "30d"): Promise<{ memory: HistorySeries; cpu: HistorySeries }> {
  await requireSession("/apps");
  const database = getDatabase();
  const safeRange = range === "7d" || range === "30d" ? range : "24h";
  return { memory: readRollupSeries(database, "app_mem", appKey, safeRange), cpu: readRollupSeries(database, "app_cpu", appKey, safeRange) };
}
