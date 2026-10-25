import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeDiscoveredItems } from "@/collector/discovery/discovery-writer";
import type { DiscoveredItem } from "@/collector/types";
import type { ServerLabDatabase } from "@/lib/database/client";
import { writeCapability } from "@/lib/database/key-value";
import { readLobbyCards } from "@/lib/queries/lobby-queries";
import { lobbyItems } from "@/lib/schema/lobby";
import { createTemporaryDatabase } from "@/lib/testing/temporary-database";

function dockerItem(name: string, image: string, hostPort: number, containerPort: number, hostAddress: string, labels: Record<string, string> = {}): DiscoveredItem {
  return { key: `docker:${name}`, source: "docker", rawName: name, image, unit: null, processName: null, description: null, ports: [{ hostPort, containerPort, protocol: "tcp", hostAddress }], labels, state: "running", health: "none", startedAt: null, bindScope: hostAddress === "127.0.0.1" ? "local" : "exposed", extra: {} };
}

describe("lobby cards", () => {
  let database: ServerLabDatabase;
  let remove: () => void;
  beforeEach(() => {
    ({ database, remove } = createTemporaryDatabase());
    writeCapability(database, "publicHostname", "homelab.tail1234.ts.net");
  });
  afterEach(() => remove());

  it("uses the catalog name and a MagicDNS link for a reachable port", () => {
    writeDiscoveredItems(database, [dockerItem("jf", "jellyfin/jellyfin:10.10", 8096, 8096, "0.0.0.0")]);
    const [card] = readLobbyCards(database);
    expect(card?.name).toBe("Jellyfin");
    expect(card?.url).toBe("http://homelab.tail1234.ts.net:8096/");
    expect(card?.bindScope).toBe("exposed");
  });

  it("prefers the nginx link over the app's own port", () => {
    const site: DiscoveredItem = { key: "nginx:jellyfin:8443", source: "nginx", rawName: "jellyfin", image: null, unit: null, processName: null, description: null, ports: [{ hostPort: 8443, containerPort: null, protocol: "tcp", hostAddress: "100.101.1.2" }], labels: {}, state: "running", health: "none", startedAt: null, bindScope: "tailnet", extra: { isSsl: true, proxyPassPort: 18096 } };
    writeDiscoveredItems(database, [dockerItem("jellyfin", "jellyfin/jellyfin", 18096, 8096, "127.0.0.1"), site]);
    const card = readLobbyCards(database).find((lobbyCard) => lobbyCard.key === "docker:jellyfin");
    expect(card?.url).toBe("https://homelab.tail1234.ts.net:8443/");
    expect(card?.viaNginxName).toBe("jellyfin");
  });

  it("applies precedence: user override, then label, then catalog", () => {
    writeDiscoveredItems(database, [dockerItem("pg", "postgres:16", 5432, 5432, "127.0.0.1", { "serverlab.name": "Main DB" })]);
    expect(readLobbyCards(database)[0]?.name).toBe("Main DB");
    expect(readLobbyCards(database)[0]?.group).toBe("databases");
    expect(readLobbyCards(database)[0]?.connectionString).toBe("postgresql://127.0.0.1:5432");
    database.insert(lobbyItems).values({ key: "docker:pg", name: "Postgres (photos)", createdAt: 0, updatedAt: 0 }).run();
    expect(readLobbyCards(database)[0]?.name).toBe("Postgres (photos)");
  });

  it("explains why a local-only app has no link", () => {
    writeDiscoveredItems(database, [dockerItem("vw", "vaultwarden/server", 18080, 80, "127.0.0.1")]);
    const [card] = readLobbyCards(database);
    expect(card?.url).toBeNull();
    expect(card?.urlNote).toMatch(/127\.0\.0\.1 only/);
  });
});
