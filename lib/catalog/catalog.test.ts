import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATALOG,
  DATABASE_PORT_HINTS,
  DATABASE_PROCESS_HINTS,
  findCatalogEntryById,
  matchCatalogEntry,
  normalizeImageName,
} from "@/lib/catalog/catalog";

const ICON_DIRECTORY = path.join(process.cwd(), "catalog", "icons");
const CATEGORIES = new Set(["app", "website", "database", "infra", "monitoring"]);

describe("normalizeImageName", () => {
  it.each([
    ["jellyfin/jellyfin", "jellyfin/jellyfin"],
    ["lscr.io/linuxserver/jellyfin:latest", "linuxserver/jellyfin"],
    ["ghcr.io/immich-app/immich-server:v1.120.0", "immich-app/immich-server"],
    ["docker.io/library/postgres:16-alpine", "postgres"],
    ["library/redis", "redis"],
    ["postgres:16", "postgres"],
    ["registry.example.com:5000/team/app:1.2", "team/app"],
    ["localhost/my-app:dev", "my-app"],
    ["localhost:5000/my-app", "my-app"],
    ["nginx@sha256:0123456789abcdef", "nginx"],
    ["ghcr.io/home-assistant/home-assistant:stable@sha256:abcdef", "home-assistant/home-assistant"],
    ["  LinuxServer/Plex:Latest  ", "linuxserver/plex"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeImageName(input)).toBe(expected);
  });

  it("keeps a first segment without a dot, colon or localhost as part of the name", () => {
    expect(normalizeImageName("bitnami/postgresql:16")).toBe("bitnami/postgresql");
  });
});

describe("matchCatalogEntry", () => {
  it("prefers the serverlab.catalog label over everything else", () => {
    expect(
      matchCatalogEntry({ catalogLabel: "grafana", image: "postgres:16", unit: "redis-server", processName: "mongod" })
        ?.id,
    ).toBe("grafana");
  });

  it("falls through when the label names an unknown id", () => {
    expect(matchCatalogEntry({ catalogLabel: "does-not-exist", image: "postgres:16" })?.id).toBe("postgresql");
  });

  it("matches by normalized image name", () => {
    expect(matchCatalogEntry({ image: "lscr.io/linuxserver/jellyfin:10.10" })?.id).toBe("jellyfin");
    expect(matchCatalogEntry({ image: "ghcr.io/immich-app/immich-machine-learning:release" })?.id).toBe(
      "immich-machine-learning",
    );
    expect(matchCatalogEntry({ image: "docker.io/library/mariadb:11" })?.id).toBe("mariadb");
  });

  it("prefers the image over the unit and process name", () => {
    expect(matchCatalogEntry({ image: "redis:7", unit: "postgresql", processName: "mongod" })?.id).toBe("redis");
  });

  it("matches units exactly, with .service, and as template instances", () => {
    expect(matchCatalogEntry({ unit: "nginx" })?.id).toBe("nginx");
    expect(matchCatalogEntry({ unit: "redis-server.service" })?.id).toBe("redis");
    expect(matchCatalogEntry({ unit: "postgresql@16-main.service" })?.id).toBe("postgresql");
    expect(matchCatalogEntry({ unit: "wg-quick@wg0" })?.id).toBe("wireguard");
    expect(matchCatalogEntry({ unit: "syncthing@joshua.service" })?.id).toBe("syncthing");
  });

  it("does not match a unit that only shares a prefix", () => {
    expect(matchCatalogEntry({ unit: "nginx-debug-helper" })).toBeNull();
  });

  it("prefers the unit over the process name", () => {
    expect(matchCatalogEntry({ unit: "mysql.service", processName: "mariadbd" })?.id).toBe("mysql");
  });

  it("matches process names case-insensitively", () => {
    expect(matchCatalogEntry({ processName: "Plex Media Serv" })?.id).toBe("plex");
    expect(matchCatalogEntry({ processName: "plex media serv" })?.id).toBe("plex");
    expect(matchCatalogEntry({ processName: "MYSQLD" })?.id).toBe("mysql");
  });

  it("returns null when nothing matches", () => {
    expect(matchCatalogEntry({})).toBeNull();
    expect(
      matchCatalogEntry({ image: "someone/unknown-app", unit: "unknown.service", processName: "unknown" }),
    ).toBeNull();
  });
});

describe("findCatalogEntryById", () => {
  it("finds known ids and returns null otherwise", () => {
    expect(findCatalogEntryById("home-assistant")?.name).toBe("Home Assistant");
    expect(findCatalogEntryById("nope")).toBeNull();
  });
});

describe("catalog data", () => {
  it("has about 80 entries with unique ids", () => {
    const ids = CATALOG.map((entry) => entry.id);
    expect(CATALOG.length).toBeGreaterThanOrEqual(75);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses kebab-case ids and valid categories", () => {
    for (const entry of CATALOG) {
      expect(entry.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(CATEGORIES.has(entry.category)).toBe(true);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("has an existing icon file for every non-null icon", () => {
    for (const entry of CATALOG) {
      if (entry.icon === null) continue;
      expect(entry.icon).toMatch(/^[a-z0-9-]+\.svg$/);
      expect(existsSync(path.join(ICON_DIRECTORY, entry.icon)), entry.icon).toBe(true);
    }
  });

  it("stores image patterns already normalized", () => {
    for (const entry of CATALOG) {
      for (const image of entry.match.image) expect(normalizeImageName(image)).toBe(image);
    }
  });

  it("never assigns the same pattern to two entries", () => {
    for (const kind of ["image", "unit", "process"] as const) {
      const seen = new Map<string, string>();
      for (const entry of CATALOG) {
        for (const pattern of entry.match[kind]) {
          const key = kind === "process" ? pattern.toLowerCase() : pattern;
          expect(seen.get(key), `${kind} ${pattern}`).toBeUndefined();
          seen.set(key, entry.id);
        }
      }
    }
  });

  it("keeps process patterns within the 15 character comm limit", () => {
    for (const entry of CATALOG) {
      for (const processName of entry.match.process) expect(processName.length).toBeLessThanOrEqual(15);
    }
  });

  it("points every database hint at a database entry", () => {
    for (const id of [...Object.values(DATABASE_PORT_HINTS), ...Object.values(DATABASE_PROCESS_HINTS)]) {
      expect(findCatalogEntryById(id)?.category).toBe("database");
    }
  });
});
