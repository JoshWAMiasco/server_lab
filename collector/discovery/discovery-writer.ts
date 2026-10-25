import { inArray } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { CATALOG_LABEL, DATABASE_PORT_HINTS, DATABASE_PROCESS_HINTS, matchCatalogEntry } from "@/lib/catalog/catalog";
import { discoveredItems } from "@/lib/schema/lobby";
import type { DiscoveredItem } from "@/collector/types";

export type DiscoveredItemRow = typeof discoveredItems.$inferSelect;

export interface DiscoveryChange {
  key: string;
  displayName: string;
  previous: DiscoveredItemRow | null;
  current: DiscoveredItemRow;
}

function resolveCatalogId(item: DiscoveredItem): string | null {
  const matchedEntry = matchCatalogEntry({ catalogLabel: item.labels[CATALOG_LABEL] ?? null, image: item.image, unit: item.unit, processName: item.processName });
  if (matchedEntry) return matchedEntry.id;
  if (item.processName && DATABASE_PROCESS_HINTS[item.processName]) return DATABASE_PROCESS_HINTS[item.processName] ?? null;
  for (const port of item.ports) {
    const hintedId = DATABASE_PORT_HINTS[port.containerPort ?? port.hostPort];
    if (hintedId && item.source !== "nginx") return hintedId;
  }
  return null;
}

/**
 * Links each nginx site to the app it proxies (by upstream port) and returns, per app key, the
 * key of the nginx site in front of it.
 */
export function linkNginxSites(items: readonly DiscoveredItem[]): Map<string, string> {
  const viaNginxByKey = new Map<string, string>();
  for (const siteItem of items.filter((item) => item.source === "nginx")) {
    const proxyPassPort = typeof siteItem.extra.proxyPassPort === "number" ? siteItem.extra.proxyPassPort : null;
    if (proxyPassPort === null) continue;
    const targetItem = items.find((item) => item.source !== "nginx" && item.ports.some((port) => port.hostPort === proxyPassPort));
    if (!targetItem) continue;
    siteItem.extra.targetKey = targetItem.key;
    siteItem.extra.targetName = targetItem.rawName;
    if (!viaNginxByKey.has(targetItem.key)) viaNginxByKey.set(targetItem.key, siteItem.key);
  }
  return viaNginxByKey;
}

/**
 * Upserts one discovery pass into `discovered_items` and returns the items whose state, health or
 * exposure changed (new items included), for the alert engine. Items missing from this pass keep
 * their row; the Lobby flags them "gone" after 24 h.
 */
export function writeDiscoveredItems(database: ServerLabDatabase, items: readonly DiscoveredItem[], now = Date.now()): DiscoveryChange[] {
  const viaNginxByKey = linkNginxSites(items);
  const keys = items.map((item) => item.key);
  const previousRows = keys.length > 0 ? database.select().from(discoveredItems).where(inArray(discoveredItems.key, keys)).all() : [];
  const previousByKey = new Map(previousRows.map((row) => [row.key, row]));
  const changes: DiscoveryChange[] = [];

  database.transaction((transaction) => {
    for (const item of items) {
      const previous = previousByKey.get(item.key) ?? null;
      const values = {
        key: item.key,
        source: item.source,
        rawName: item.rawName,
        image: item.image,
        unit: item.unit,
        processName: item.processName,
        description: item.description,
        ports: item.ports,
        labels: item.labels,
        catalogId: resolveCatalogId(item),
        state: item.state,
        health: item.health,
        bindScope: item.bindScope,
        viaNginxKey: viaNginxByKey.get(item.key) ?? null,
        extra: item.extra,
        startedAt: item.startedAt,
        firstSeen: previous?.firstSeen ?? now,
        lastSeen: now,
      };
      const updatableValues: Partial<typeof values> = { ...values };
      delete updatableValues.key;
      delete updatableValues.firstSeen;
      const current = transaction.insert(discoveredItems).values(values).onConflictDoUpdate({ target: discoveredItems.key, set: updatableValues }).returning().get();
      if (!previous || previous.state !== current.state || previous.health !== current.health || previous.bindScope !== current.bindScope) {
        changes.push({ key: item.key, displayName: item.rawName, previous, current });
      }
    }
  });
  return changes;
}
