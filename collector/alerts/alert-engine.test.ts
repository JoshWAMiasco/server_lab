import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertEngine, seedDefaultAlertRules } from "@/collector/alerts/alert-engine";
import type { DiscoveryChange } from "@/collector/discovery/discovery-writer";
import type { SystemSample } from "@/collector/types";
import type { ServerLabDatabase } from "@/lib/database/client";
import { alertEvents, alertRules } from "@/lib/schema/alerts";
import { createTemporaryDatabase } from "@/lib/testing/temporary-database";

vi.mock("@/collector/alerts/notifiers", () => ({ notifyChannels: vi.fn(async () => true), sendToChannel: vi.fn(async () => undefined) }));

function sample(timestamp: number, cpuPercent: number): SystemSample {
  return {
    timestamp,
    cpuPercent,
    corePercents: [],
    loadAverages: [0, 0, 0],
    memory: { totalBytes: 100, availableBytes: 50, usedBytes: 50, cachedBytes: 0, swapTotalBytes: 0, swapUsedBytes: 0 },
    cpuTemperatureCelsius: 40,
    temperatures: [],
    networkInterfaces: [],
    disks: [],
    gpus: [],
    uptimeSeconds: 1,
  };
}

describe("alert engine", () => {
  let database: ServerLabDatabase;
  let remove: () => void;
  beforeEach(() => {
    vi.clearAllMocks();
    ({ database, remove } = createTemporaryDatabase());
    seedDefaultAlertRules(database);
  });
  afterEach(() => remove());

  it("fires High CPU only after 5 minutes above 90 % and resolves once", async () => {
    const { notifyChannels } = await import("@/collector/alerts/notifiers");
    const engine = new AlertEngine(database, "test-host");
    const start = 1_000_000;
    for (let second = 0; second <= 6 * 60; second += 2) await engine.evaluateSample(sample(start + second * 1000, 99));
    const firing = database.select().from(alertEvents).where(eq(alertEvents.state, "firing")).all();
    expect(firing).toHaveLength(1);
    expect(firing[0]?.ruleName).toBe("High CPU");
    expect(firing[0]?.startedAt).toBeGreaterThanOrEqual(start + 300_000);
    await engine.evaluateSample(sample(start + 7 * 60_000, 20));
    expect(database.select().from(alertEvents).where(eq(alertEvents.state, "resolved")).all()).toHaveLength(1);
    expect(vi.mocked(notifyChannels).mock.calls.filter(([, notification]) => notification.state === "firing")).toHaveLength(1);
    expect(vi.mocked(notifyChannels).mock.calls.filter(([, notification]) => notification.state === "resolved")).toHaveLength(1);
  });

  it("does not open a duplicate event after a restart while firing", async () => {
    const start = 2_000_000;
    const firstEngine = new AlertEngine(database, "test-host");
    for (let second = 0; second <= 310; second += 2) await firstEngine.evaluateSample(sample(start + second * 1000, 99));
    const restartedEngine = new AlertEngine(database, "test-host");
    for (let second = 312; second <= 400; second += 2) await restartedEngine.evaluateSample(sample(start + second * 1000, 99));
    expect(database.select().from(alertEvents).all()).toHaveLength(1);
  });

  it("ignores disabled rules", async () => {
    database.update(alertRules).set({ isEnabled: false }).where(eq(alertRules.name, "High CPU")).run();
    const engine = new AlertEngine(database, "test-host");
    for (let second = 0; second <= 400; second += 2) await engine.evaluateSample(sample(second * 1000, 99));
    expect(database.select().from(alertEvents).all()).toHaveLength(0);
  });

  it("fires Service down when a running item exits and resolves when it is back", async () => {
    const engine = new AlertEngine(database, "test-host");
    const base = { key: "docker:jellyfin", source: "docker" as const, rawName: "jellyfin", image: null, unit: null, processName: null, description: null, ports: [], labels: {}, catalogId: null, health: "none", bindScope: "local" as const, viaNginxKey: null, extra: {}, startedAt: null, firstSeen: 0, lastSeen: 0, hostId: 1 };
    const change = (previousState: string, currentState: string): DiscoveryChange => ({ key: base.key, displayName: "jellyfin", previous: { ...base, state: previousState }, current: { ...base, state: currentState } });
    await engine.handleDiscoveryChanges([change("running", "exited")]);
    expect(database.select().from(alertEvents).where(eq(alertEvents.state, "firing")).all().map((alertEvent) => alertEvent.ruleName)).toEqual(["Service down"]);
    await engine.handleDiscoveryChanges([change("exited", "running")]);
    expect(database.select().from(alertEvents).where(eq(alertEvents.state, "firing")).all()).toHaveLength(0);
  });
});
