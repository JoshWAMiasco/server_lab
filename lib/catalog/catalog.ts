import catalogData from "@/catalog/catalog.json";

/*
 * Typed access to catalog/catalog.json, the list of known homelab software.
 *
 * Match patterns:
 * - `image`: repository names already normalized by normalizeImageName (no registry, tag or digest,
 *   no `library/`), e.g. `linuxserver/jellyfin`, `postgres`, `immich-app/immich-server`.
 * - `unit`: systemd unit base names. A pattern `x` matches `x`, `x.service`, `x@anything` and
 *   `x@anything.service`, so `postgresql` matches `postgresql@16-main.service` and `wg-quick`
 *   matches `wg-quick@wg0`. Unit names are compared case-sensitively, like systemd does.
 * - `process`: the kernel `comm` name that `ss -p` prints (at most 15 characters, so
 *   `prometheus-node-exporter` appears as `prometheus-node`). Compared case-insensitively.
 */

export type CatalogCategory = "app" | "website" | "database" | "infra" | "monitoring";

export interface CatalogMatchPatterns {
  image: string[];
  unit: string[];
  process: string[];
}

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  category: CatalogCategory;
  /** File name inside catalog/icons, served at /catalog-icons/<icon>; null when no icon is vendored. */
  icon: string | null;
  match: CatalogMatchPatterns;
  defaultPort: number | null;
  /** Path appended to the app's URL; null when the software has no web UI. */
  urlPath: string | null;
  isHttps: boolean;
}

export interface CatalogMatchInput {
  /** Value of the `serverlab.catalog` Docker label. */
  catalogLabel?: string | null;
  image?: string | null;
  unit?: string | null;
  processName?: string | null;
}

export const CATALOG: readonly CatalogEntry[] = catalogData as CatalogEntry[];

/** Docker label that pins a container to a catalog entry id. */
export const CATALOG_LABEL = "serverlab.catalog";

/** Well-known database ports, mapped to catalog entry ids. Used when nothing else matched. */
export const DATABASE_PORT_HINTS: Record<number, string> = {
  3306: "mysql",
  5432: "postgresql",
  6379: "redis",
  27017: "mongodb",
  8086: "influxdb",
};

/** Database server process names (`ss -p` comm), mapped to catalog entry ids. */
export const DATABASE_PROCESS_HINTS: Record<string, string> = {
  mysqld: "mysql",
  mariadbd: "mariadb",
  postgres: "postgresql",
  "redis-server": "redis",
  mongod: "mongodb",
};

/**
 * Reduces a Docker image reference to its repository name: drops the registry host (a first path
 * segment containing `.` or `:`, or `localhost`), `library/`, the tag and the digest, and lowercases.
 * `lscr.io/linuxserver/jellyfin:latest` becomes `linuxserver/jellyfin`, `docker.io/library/postgres:16`
 * becomes `postgres`.
 */
export function normalizeImageName(image: string): string {
  let name = image.trim().toLowerCase();
  const digestStart = name.indexOf("@");
  if (digestStart !== -1) name = name.slice(0, digestStart);

  const segments = name.split("/");
  const firstSegment = segments[0] ?? "";
  if (
    segments.length > 1 &&
    (firstSegment.includes(".") || firstSegment.includes(":") || firstSegment === "localhost")
  ) {
    segments.shift();
  }

  const lastSegment = segments.at(-1) ?? "";
  const tagStart = lastSegment.indexOf(":");
  if (tagStart !== -1) segments[segments.length - 1] = lastSegment.slice(0, tagStart);

  if (segments.length > 1 && segments[0] === "library") segments.shift();
  return segments.join("/");
}

/** Strips `.service` and any `@instance` part, so `syncthing@joshua.service` becomes `syncthing`. */
function unitBaseName(unit: string): string {
  const withoutSuffix = unit.endsWith(".service") ? unit.slice(0, -".service".length) : unit;
  const instanceStart = withoutSuffix.indexOf("@");
  return instanceStart === -1 ? withoutSuffix : withoutSuffix.slice(0, instanceStart);
}

function buildLookup(
  patternsOf: (entry: CatalogEntry) => string[],
  normalize: (pattern: string) => string,
): Map<string, CatalogEntry> {
  const lookup = new Map<string, CatalogEntry>();
  for (const entry of CATALOG) {
    for (const pattern of patternsOf(entry)) {
      const key = normalize(pattern);
      if (!lookup.has(key)) lookup.set(key, entry);
    }
  }
  return lookup;
}

const ENTRIES_BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]));
const ENTRIES_BY_IMAGE = buildLookup((entry) => entry.match.image, normalizeImageName);
const ENTRIES_BY_UNIT = buildLookup(
  (entry) => entry.match.unit,
  (pattern) => pattern,
);
const ENTRIES_BY_PROCESS = buildLookup(
  (entry) => entry.match.process,
  (pattern) => pattern.toLowerCase(),
);

export function findCatalogEntryById(id: string): CatalogEntry | null {
  return ENTRIES_BY_ID.get(id.trim().toLowerCase()) ?? null;
}

function matchUnit(unit: string): CatalogEntry | null {
  const trimmed = unit.trim();
  const withoutSuffix = trimmed.endsWith(".service") ? trimmed.slice(0, -".service".length) : trimmed;
  return ENTRIES_BY_UNIT.get(withoutSuffix) ?? ENTRIES_BY_UNIT.get(unitBaseName(trimmed)) ?? null;
}

/**
 * Finds the catalog entry for a discovered item. Order: the `serverlab.catalog` label id, then the
 * normalized image name, then the systemd unit, then the process name. Returns null when nothing matches.
 */
export function matchCatalogEntry({ catalogLabel, image, unit, processName }: CatalogMatchInput): CatalogEntry | null {
  if (catalogLabel) {
    const labelled = findCatalogEntryById(catalogLabel);
    if (labelled) return labelled;
  }
  if (image) {
    const byImage = ENTRIES_BY_IMAGE.get(normalizeImageName(image));
    if (byImage) return byImage;
  }
  if (unit) {
    const byUnit = matchUnit(unit);
    if (byUnit) return byUnit;
  }
  if (processName) {
    const byProcess = ENTRIES_BY_PROCESS.get(processName.trim().toLowerCase());
    if (byProcess) return byProcess;
  }
  return null;
}
