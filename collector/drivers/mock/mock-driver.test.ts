import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeDiscoveredItems } from "@/collector/discovery/discovery-writer";
import { MockDriver } from "@/collector/drivers/mock/mock-driver";
import { writeAppUsage, writeSystemSample } from "@/collector/storage/sample-writer";
import type { ServerLabDatabase } from "@/lib/database/client";
import { readSystemSamplesSince } from "@/lib/queries/system-queries";
import { storeLoginEvent } from "@/lib/watcher/login-event-store";
import { createTemporaryDatabase } from "@/lib/testing/temporary-database";

describe("collector with the mock driver", () => {
  let database: ServerLabDatabase;
  let remove: () => void;
  beforeEach(() => ({ database, remove } = createTemporaryDatabase()));
  afterEach(() => remove());

  it("writes samples with their child rows and reads them back", async () => {
    const driver = new MockDriver();
    for (let tick = 0; tick < 3; tick += 1) writeSystemSample(database, await driver.sampleSystem());
    const samples = readSystemSamplesSince(database, 0);
    expect(samples).toHaveLength(3);
    expect(samples[0]?.corePercents).toHaveLength(12);
    expect(samples[0]?.gpus[0]?.name).toContain("RTX");
    expect(samples[0]?.networkInterfaces.map((networkInterface) => networkInterface.interfaceName)).toContain("enp3s0");
  });

  it("discovers items, links nginx and samples app usage", async () => {
    const driver = new MockDriver();
    const items = await driver.discoverItems();
    writeDiscoveredItems(database, items);
    const jellyfin = database.$client.prepare("SELECT catalog_id AS catalogId, via_nginx_key AS viaNginxKey FROM discovered_items WHERE key = 'docker:jellyfin'").get();
    expect(jellyfin).toEqual({ catalogId: "jellyfin", viaNginxKey: "nginx:jellyfin:8096" });
    const readings = await driver.sampleAppUsage(items);
    writeAppUsage(database, Date.now(), readings);
    expect(readings.length).toBeGreaterThan(10);
    expect(readings.every((reading) => reading.memoryBytes > 0)).toBe(true);
  });

  it("stores each login once even when it is replayed", async () => {
    const loginEvent = { timestamp: 1_700_000_000_000, channel: "ssh" as const, username: "root", result: "failure" as const, method: "password", sourceAddress: "203.0.113.5", sourcePort: 40_000, raw: "Failed password for root" };
    expect(await storeLoginEvent(database, loginEvent)).not.toBeNull();
    expect(await storeLoginEvent(database, loginEvent)).toBeNull();
    const stored = await storeLoginEvent(database, { ...loginEvent, sourceAddress: "100.101.2.3", sourcePort: 1 });
    expect(stored?.networkTag).toBe("tailnet");
  });
});
