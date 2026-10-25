import { and, eq, isNull } from "drizzle-orm";
import type { CollectorDriver } from "@/collector/driver";
import { AlertEngine, seedDefaultAlertRules } from "@/collector/alerts/alert-engine";
import { writeDiscoveredItems } from "@/collector/discovery/discovery-writer";
import { createGpuPowerJob } from "@/collector/jobs/gpu-power-job";
import { runManualHealthChecks } from "@/collector/jobs/manual-health-job";
import { runRetention } from "@/collector/jobs/retention-job";
import { runFullRollups, runRollups } from "@/collector/jobs/rollup-job";
import { runEvery } from "@/collector/scheduler";
import { writeAppUsage, writeFilesystemUsage, writeSystemSample } from "@/collector/storage/sample-writer";
import type { DiscoveredItem, ParsedLoginEvent } from "@/collector/types";
import { openDatabase } from "@/lib/database/client";
import { readSetting, writeCapability, writeSetting } from "@/lib/database/key-value";
import { readRetentionSettings } from "@/lib/database/retention";
import { collectorHeartbeat } from "@/lib/schema/system";
import { loginEvents } from "@/lib/schema/watcher";
import { storeLoginEvent } from "@/lib/watcher/login-event-store";
import { readEnvironment } from "@/lib/environment";

const COLLECTOR_VERSION = "0.1.0";
const SAMPLE_INTERVAL_MILLISECONDS = Math.max(1000, Number(readEnvironment("SAMPLE_INTERVAL_MS") ?? 2000));
const JOURNAL_CURSOR_KEY = "watcher.journalCursor";
const BACKFILL_STATE_KEY = "watcher.backfill";

async function createDriver(): Promise<CollectorDriver> {
  const requestedDriver = readEnvironment("COLLECTOR_DRIVER") ?? (process.platform === "linux" ? "linux" : "mock");
  if (requestedDriver === "mock") {
    const { MockDriver } = await import("@/collector/drivers/mock/mock-driver");
    return new MockDriver();
  }
  if (process.platform !== "linux") throw new Error("COLLECTOR_DRIVER=linux only works on Linux. Use COLLECTOR_DRIVER=mock for development.");
  const { LinuxDriver } = await import("@/collector/drivers/linux/linux-driver");
  return new LinuxDriver();
}

async function main() {
  const database = openDatabase();
  const driver = await createDriver();
  const hostname = driver.readHostname();
  console.log(`[collector] ServerLab collector ${COLLECTOR_VERSION} starting with the ${driver.name} driver on ${hostname}`);

  seedDefaultAlertRules(database);
  if (driver.name === "mock") {
    const { seedMockHistory } = await import("@/collector/drivers/mock/seed-history");
    seedMockHistory(database);
  }
  runFullRollups(database);
  const alertEngine = new AlertEngine(database, hostname);
  let latestItems: DiscoveredItem[] = [];
  let tailnetDevices = new Map<string, string>();

  const writeHeartbeat = () => {
    const values = { id: 1, timestamp: Date.now(), version: COLLECTOR_VERSION, driver: driver.name, hostname };
    database.insert(collectorHeartbeat).values(values).onConflictDoUpdate({ target: collectorHeartbeat.id, set: values }).run();
  };

  const detectCapabilities = async () => {
    const capabilities = await driver.detectCapabilities();
    for (const [key, value] of Object.entries(capabilities)) writeCapability(database, key, value);
    writeCapability(database, "publicHostname", await driver.readPublicHostname());
    writeCapability(database, "hostname", hostname);
    writeCapability(database, "geoip", Boolean(process.env.GEOIP_DB_PATH) || driver.name === "mock");
  };
  await detectCapabilities();
  writeHeartbeat();

  let lastDiscoveryAt = 0;
  let isDiscovering = false;
  const runDiscovery = async () => {
    if (isDiscovering) return;
    isDiscovering = true;
    lastDiscoveryAt = Date.now();
    try {
      latestItems = await driver.discoverItems();
      const changes = writeDiscoveredItems(database, latestItems);
      if (driver.readWarnings) writeCapability(database, "warnings", driver.readWarnings());
      await alertEngine.handleDiscoveryChanges(changes);
    } finally {
      isDiscovering = false;
    }
  };

  const loginQueue: ParsedLoginEvent[] = [];
  let isDrainingLogins = false;
  const drainLoginQueue = async () => {
    if (isDrainingLogins) return;
    isDrainingLogins = true;
    try {
      while (loginQueue.length > 0) {
        const loginEvent = loginQueue.shift() as ParsedLoginEvent;
        const tailnetDevice = loginEvent.sourceAddress ? (tailnetDevices.get(loginEvent.sourceAddress) ?? null) : null;
        const geolocationOverride = loginEvent.sourceAddress && driver.overrideGeolocation ? driver.overrideGeolocation(loginEvent.sourceAddress) : undefined;
        const stored = await storeLoginEvent(database, loginEvent, { tailnetDevice, geolocationOverride });
        if (stored) await alertEngine.handleLoginEvent(stored);
      }
    } finally {
      isDrainingLogins = false;
    }
  };

  const stopFunctions = [
    runEvery("heartbeat", 5000, writeHeartbeat, { runImmediately: false }),
    runEvery("capabilities", 10 * 60_000, detectCapabilities, { runImmediately: false }),
    runEvery("system sample", SAMPLE_INTERVAL_MILLISECONDS, async () => {
      const sample = await driver.sampleSystem();
      writeSystemSample(database, sample);
      await alertEngine.evaluateSample(sample);
    }),
    runEvery("filesystems", 60_000, async () => {
      const filesystems = await driver.sampleFilesystems();
      writeFilesystemUsage(database, Date.now(), filesystems);
      alertEngine.updateFilesystems(filesystems);
    }),
    runEvery("discovery", 60_000, runDiscovery),
    runEvery("rescan requests", 3000, async () => {
      const requestedAt = readSetting<number>(database, "discovery.rescanRequestedAt", 0);
      if (requestedAt > lastDiscoveryAt) await runDiscovery();
    }),
    runEvery("app usage", 10_000, async () => {
      if (latestItems.length === 0) return;
      const readings = await driver.sampleAppUsage(latestItems);
      writeAppUsage(database, Date.now(), readings);
      alertEngine.updateAppUsage(readings);
    }),
    runEvery("manual health checks", 60_000, () => runManualHealthChecks(database)),
    runEvery("tailnet devices", 5 * 60_000, async () => {
      tailnetDevices = await driver.readTailnetDevices();
      for (const [ipAddress, deviceName] of tailnetDevices) {
        database.update(loginEvents).set({ tailnetDevice: deviceName }).where(and(eq(loginEvents.sourceAddress, ipAddress), isNull(loginEvents.tailnetDevice))).run();
      }
    }),
    runEvery("rollups", 60_000, () => runRollups(database), { runImmediately: false }),
    runEvery("retention", 60 * 60_000, () => runRetention(database)),
    runEvery("tls certificate", 60 * 60_000, () => alertEngine.checkTlsCertificate()),
    runEvery("notification tests", 3000, () => alertEngine.processTestRequest()),
    runEvery("gpu power", 3000, createGpuPowerJob(database, driver)),
  ];

  const backfillState = readSetting<{ state: "running" | "done"; count: number } | null>(database, BACKFILL_STATE_KEY, null);
  if (backfillState?.state !== "done") {
    writeSetting(database, BACKFILL_STATE_KEY, { state: "running", count: 0 });
    const retentionDays = readRetentionSettings(database).loginDays;
    void driver
      .readLoginHistory(Date.now() - retentionDays * 86_400_000)
      .then(async (historicEvents) => {
        let importedCount = 0;
        for (const historicEvent of historicEvents) {
          const geolocationOverride = historicEvent.sourceAddress && driver.overrideGeolocation ? driver.overrideGeolocation(historicEvent.sourceAddress) : undefined;
          if (await storeLoginEvent(database, historicEvent, { isBackfilled: true, geolocationOverride })) importedCount += 1;
          if (importedCount % 200 === 0) writeSetting(database, BACKFILL_STATE_KEY, { state: "running", count: importedCount });
        }
        writeSetting(database, BACKFILL_STATE_KEY, { state: "done", count: importedCount });
        console.log(`[collector] Imported ${importedCount} historic login events`);
      })
      .catch((error: unknown) => {
        writeSetting(database, BACKFILL_STATE_KEY, { state: "done", count: 0 });
        console.error("[collector] Login history import failed:", error instanceof Error ? error.message : error);
      });
  }

  const loginWatch = driver.watchLogins({
    resumeCursor: readSetting<string | null>(database, JOURNAL_CURSOR_KEY, null),
    onLoginEvent: (loginEvent) => {
      loginQueue.push(loginEvent);
      void drainLoginQueue();
    },
    onCursor: (cursor) => writeSetting(database, JOURNAL_CURSOR_KEY, cursor),
  });

  const shutDown = (signalName: string) => {
    console.log(`[collector] ${signalName} received, stopping`);
    for (const stop of stopFunctions) stop();
    loginWatch.stop();
    database.$client.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutDown("SIGTERM"));
  process.on("SIGINT", () => shutDown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error("[collector] Fatal:", error);
  process.exit(1);
});
