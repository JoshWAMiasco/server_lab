import { CATALOG, findCatalogEntryById, type CatalogEntry } from "@/lib/catalog/catalog";
import type { ServerLabDatabase } from "@/lib/database/client";
import { readCapability, readSetting } from "@/lib/database/key-value";
import { discoveredItems, lobbyItems } from "@/lib/schema/lobby";
import type { LobbyCard, LobbyCategory, LobbyGroup } from "@/lib/queries/lobby-types";

type DiscoveredRow = typeof discoveredItems.$inferSelect;
type LobbyItemRow = typeof lobbyItems.$inferSelect;

const GONE_AFTER_MILLISECONDS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MILLISECONDS = 5 * 60 * 1000;
const CONNECTION_SCHEMES: Record<string, string> = { postgresql: "postgresql", mysql: "mysql", mariadb: "mysql", redis: "redis", valkey: "redis", mongodb: "mongodb", influxdb: "http", elasticsearch: "http", meilisearch: "http" };
const KNOWN_ICON_FILE_NAMES = new Set(CATALOG.map((entry) => entry.icon).filter((icon): icon is string => icon !== null));

export const PUBLIC_HOSTNAME_SETTING_KEY = "publicHostname";

/**
 * The host name used for "Open" links: the Settings override, else the collector's detected
 * MagicDNS name, else "localhost".
 */
export function readPublicHostname(database: ServerLabDatabase): string {
  return readSetting<string>(database, PUBLIC_HOSTNAME_SETTING_KEY, "") || readCapability<string>(database, "publicHostname", "") || "localhost";
}

function readHttpUrl(value: string | undefined | null): string | null {
  return value && /^https?:\/\/[^\s"'<>]+$/i.test(value) ? value : null;
}

function buildUrl(scheme: string, hostname: string, port: number, urlPath: string): string {
  const isDefaultPort = (scheme === "https" && port === 443) || (scheme === "http" && port === 80);
  return `${scheme}://${hostname}${isDefaultPort ? "" : `:${port}`}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`;
}

function resolveGroup(category: LobbyCategory, source: LobbyCard["source"]): LobbyGroup {
  if (category === "database") return "databases";
  if (category === "website" || source === "nginx") return "websites";
  if (category === "service" || (source === "systemd" && category !== "app")) return "services";
  return "apps";
}

function resolveStatus(row: DiscoveredRow, now: number): Pick<LobbyCard, "statusTone" | "statusLabel"> {
  if (now - row.lastSeen > STALE_AFTER_MILLISECONDS) return { statusTone: "slate", statusLabel: "not detected" };
  if (row.state === "failed") return { statusTone: "danger", statusLabel: "failed" };
  if (row.health === "unhealthy") return { statusTone: "danger", statusLabel: "unhealthy" };
  if (row.state === "starting" || row.health === "starting") return { statusTone: "warning", statusLabel: "starting" };
  if (row.state === "running") return { statusTone: "success", statusLabel: row.health === "healthy" ? "healthy" : "running" };
  if (row.state === "exited") return { statusTone: "slate", statusLabel: "stopped" };
  return { statusTone: "slate", statusLabel: row.state };
}

function readImageVersion(image: string | null): string | null {
  if (!image) return null;
  const tag = /:([^/:@]+)(?:@.*)?$/.exec(image)?.[1];
  return tag && tag !== "latest" ? tag : null;
}

function buildDiscoveredCard(row: DiscoveredRow, override: LobbyItemRow | undefined, rowsByKey: Map<string, DiscoveredRow>, hostname: string, now: number): LobbyCard {
  const catalogEntry: CatalogEntry | null = row.catalogId ? findCatalogEntryById(row.catalogId) : null;
  const labels = row.labels;
  const extra = row.extra;
  const labelIcon = labels["serverlab.icon"] && KNOWN_ICON_FILE_NAMES.has(labels["serverlab.icon"]) ? labels["serverlab.icon"] : null;
  const defaultCategory: LobbyCategory = catalogEntry?.category ?? (row.source === "nginx" ? "website" : row.source === "systemd" ? "service" : "app");
  const category = (override?.category ?? labels["serverlab.category"] ?? defaultCategory) as LobbyCategory;
  const nginxItem = row.viaNginxKey ? rowsByKey.get(row.viaNginxKey) : undefined;
  const nginxTarget = typeof extra.targetKey === "string" ? rowsByKey.get(extra.targetKey) : undefined;
  const nginxTargetEntry = nginxTarget?.catalogId ? findCatalogEntryById(nginxTarget.catalogId) : null;

  let url: string | null = readHttpUrl(override?.url) ?? readHttpUrl(labels["serverlab.url"]);
  let urlNote: string | null = null;
  if (!url && row.source === "nginx") {
    const port = row.ports[0]?.hostPort ?? 443;
    url = buildUrl(extra.isSsl ? "https" : "http", hostname, port, "/");
    if (Number(extra.sharesPortWith) > 0) urlNote = `Shares port ${port} with ${extra.sharesPortWith} other site(s); the link opens the default site. Give this site its own port.`;
  } else if (!url && nginxItem) {
    const port = nginxItem.ports[0]?.hostPort ?? 443;
    url = buildUrl(nginxItem.extra.isSsl ? "https" : "http", hostname, port, catalogEntry?.urlPath ?? "/");
  } else if (!url && catalogEntry?.urlPath !== null && category !== "database") {
    const reachablePorts = row.ports.filter((port) => port.hostAddress !== "127.0.0.1" && port.hostAddress !== "::1");
    const preferredPort = reachablePorts.find((port) => port.containerPort === catalogEntry?.defaultPort || port.hostPort === catalogEntry?.defaultPort) ?? reachablePorts[0];
    if (preferredPort) url = buildUrl(catalogEntry?.isHttps || preferredPort.hostPort === 443 || preferredPort.hostPort === 8443 ? "https" : "http", hostname, preferredPort.hostPort, catalogEntry?.urlPath ?? "/");
    else if (row.ports.length > 0) urlNote = "Listens on 127.0.0.1 only. Add an nginx site on the Tailscale IP to open it from your devices.";
  }

  let connectionString: string | null = null;
  if (category === "database" && row.ports[0]) {
    const scheme = CONNECTION_SCHEMES[catalogEntry?.id ?? ""] ?? "tcp";
    connectionString = `${scheme}://${row.ports[0].hostAddress === "0.0.0.0" || row.ports[0].hostAddress === "::" ? hostname : row.ports[0].hostAddress}:${row.ports[0].hostPort}`;
  }

  const defaultDescription =
    row.source === "nginx"
      ? typeof extra.staticRoot === "string"
        ? `Static site from ${extra.staticRoot}`
        : nginxTarget
          ? `Reverse proxy to ${nginxTargetEntry?.name ?? nginxTarget.rawName}`
          : typeof extra.proxyPassTarget === "string"
            ? `Reverse proxy to ${extra.proxyPassTarget}`
            : "nginx site"
      : row.source === "systemd" && typeof extra.siteCount === "number"
        ? `${catalogEntry?.description ?? row.description ?? ""} Serves ${extra.siteCount} site(s).`.trim()
        : (catalogEntry?.description ?? row.description ?? (row.image ? `Container from ${row.image}` : row.unit ? `systemd unit ${row.unit}` : "Detected listener"));

  return {
    key: row.key,
    lobbyItemId: override?.id ?? null,
    source: row.source,
    group: resolveGroup(category, row.source),
    category,
    name: override?.name ?? labels["serverlab.name"] ?? catalogEntry?.name ?? row.rawName,
    description: override?.description ?? labels["serverlab.description"] ?? defaultDescription,
    iconFileName: override?.icon ?? labelIcon ?? catalogEntry?.icon ?? null,
    detectedIconFileName: labelIcon ?? catalogEntry?.icon ?? null,
    url,
    urlNote,
    connectionString,
    state: row.state,
    health: row.health,
    ...resolveStatus(row, now),
    startedAt: row.startedAt,
    ports: row.ports,
    bindScope: row.bindScope,
    isHidden: Boolean(override?.isHidden) || labels["serverlab.hide"] === "true",
    isGone: now - row.lastSeen > GONE_AFTER_MILLISECONDS,
    isSystemService: extra.isSystemService === true,
    catalogId: row.catalogId,
    viaNginxName: nginxItem ? nginxItem.rawName : null,
    nginxTargetName: nginxTarget ? (nginxTargetEntry?.name ?? nginxTarget.rawName) : null,
    serverNames: Array.isArray(extra.serverNames) ? (extra.serverNames as string[]) : [],
    sharesPortWith: Number(extra.sharesPortWith ?? 0),
    image: row.image,
    unit: row.unit,
    version: readImageVersion(row.image),
    healthCheckUrl: override?.healthCheckUrl ?? null,
    overrides: { name: override?.name ?? null, description: override?.description ?? null, url: override?.url ?? null, icon: override?.icon ?? null, category: override?.category ?? null },
  };
}

function buildManualCard(item: LobbyItemRow): LobbyCard {
  const category = (item.category ?? "app") as LobbyCategory;
  const healthState = item.healthCheckState;
  return {
    key: `manual:${item.id}`,
    lobbyItemId: item.id,
    source: "manual",
    group: resolveGroup(category, "manual"),
    category,
    name: item.name ?? "Untitled",
    description: item.description ?? "",
    iconFileName: item.icon,
    detectedIconFileName: null,
    url: item.url,
    urlNote: null,
    connectionString: null,
    state: "unknown",
    health: healthState ?? "none",
    statusTone: healthState === "healthy" ? "success" : healthState === "unhealthy" ? "danger" : "slate",
    statusLabel: healthState === "healthy" ? "up" : healthState === "unhealthy" ? "down" : item.healthCheckUrl ? "checking" : "manual",
    startedAt: null,
    ports: [],
    bindScope: "local",
    isHidden: item.isHidden,
    isGone: false,
    isSystemService: false,
    catalogId: null,
    viaNginxName: null,
    nginxTargetName: null,
    serverNames: [],
    sharesPortWith: 0,
    image: null,
    unit: null,
    version: null,
    healthCheckUrl: item.healthCheckUrl,
    overrides: { name: item.name, description: item.description, url: item.url, icon: item.icon, category: item.category },
  };
}

/**
 * Every Lobby card: detected items merged with user overrides (user value → Docker label →
 * catalog → detected value), plus manual items, sorted by `sort_order` then name.
 */
export function readLobbyCards(database: ServerLabDatabase, now = Date.now()): LobbyCard[] {
  const discoveredRows = database.select().from(discoveredItems).all();
  const lobbyRows = database.select().from(lobbyItems).all();
  const overridesByKey = new Map(lobbyRows.filter((item) => item.key).map((item) => [item.key as string, item]));
  const rowsByKey = new Map(discoveredRows.map((row) => [row.key, row]));
  const hostname = readPublicHostname(database);
  const sortOrderByKey = new Map(lobbyRows.map((item) => [item.key ?? `manual:${item.id}`, item.sortOrder]));
  const cards = [...discoveredRows.map((row) => buildDiscoveredCard(row, overridesByKey.get(row.key), rowsByKey, hostname, now)), ...lobbyRows.filter((item) => !item.key).map(buildManualCard)];
  return cards.sort((left, right) => (sortOrderByKey.get(left.key) ?? 0) - (sortOrderByKey.get(right.key) ?? 0) || left.name.localeCompare(right.name));
}
