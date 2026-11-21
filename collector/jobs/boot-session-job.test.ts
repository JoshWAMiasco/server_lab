import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordShutdownIntent, startBootSession, touchBootSession } from "@/collector/jobs/boot-session-job";
import type { ServerLabDatabase } from "@/lib/database/client";
import { readCurrentUptimeStreak, readUptimeSummary } from "@/lib/queries/uptime-queries";
import { bootSessions } from "@/lib/schema/system";
import { createTemporaryDatabase } from "@/lib/testing/temporary-database";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const unknownEnd = async () => null;

describe("boot sessions and the uptime streak", () => {
  let database: ServerLabDatabase;
  let remove: () => void;
  beforeEach(() => ({ database, remove } = createTemporaryDatabase()));
  afterEach(() => remove());

  const readRows = () => database.select().from(bootSessions).orderBy(bootSessions.bootedAt).all();

  it("starts a streak on the first boot it sees", async () => {
    expect(await startBootSession(database, { bootId: "boot-a", bootedAt: 1000 }, unknownEnd, 5000)).toBeNull();
    expect(readCurrentUptimeStreak(database)).toEqual({ streakStartedAt: 1000, bootedAt: 1000, rebootCount: 0, lastRebootAt: null });
  });

  it("treats a known boot id as a collector restart and clears a stop that was not a shutdown", async () => {
    await startBootSession(database, { bootId: "boot-a", bootedAt: 1000 }, unknownEnd, 5000);
    recordShutdownIntent(database, "boot-a", "reboot", 6000);
    await startBootSession(database, { bootId: "boot-a", bootedAt: 1000 }, unknownEnd, 7000);
    expect(readRows()).toHaveLength(1);
    expect(readRows()[0]).toMatchObject({ endKind: null, endedAt: null, lastSeenAt: 7000 });
  });

  it("keeps the streak across reboots and resets it on shutdown", async () => {
    await startBootSession(database, { bootId: "boot-a", bootedAt: 0 }, unknownEnd, HOUR);
    touchBootSession(database, "boot-a", 2 * DAY);
    recordShutdownIntent(database, "boot-a", "reboot", 2 * DAY + 1000);
    expect(await startBootSession(database, { bootId: "boot-b", bootedAt: 2 * DAY + 60_000 }, unknownEnd, 2 * DAY + 90_000)).toBe("reboot");
    expect(readCurrentUptimeStreak(database)).toEqual({ streakStartedAt: 0, bootedAt: 2 * DAY + 60_000, rebootCount: 1, lastRebootAt: 2 * DAY + 60_000 });

    recordShutdownIntent(database, "boot-b", "shutdown", 3 * DAY);
    expect(await startBootSession(database, { bootId: "boot-c", bootedAt: 4 * DAY }, unknownEnd, 4 * DAY + 30_000)).toBe("shutdown");
    expect(readCurrentUptimeStreak(database)).toEqual({ streakStartedAt: 4 * DAY, bootedAt: 4 * DAY, rebootCount: 0, lastRebootAt: null });
  });

  it("asks the journal when the stop was not recorded, and calls it a crash when the journal does not know", async () => {
    await startBootSession(database, { bootId: "boot-a", bootedAt: 0 }, unknownEnd, HOUR);
    expect(await startBootSession(database, { bootId: "boot-b", bootedAt: DAY }, async () => "reboot", DAY + 1000)).toBe("reboot");
    expect(readCurrentUptimeStreak(database)?.streakStartedAt).toBe(0);
    expect(await startBootSession(database, { bootId: "boot-c", bootedAt: 2 * DAY }, unknownEnd, 2 * DAY + 1000)).toBe("crash");
    expect(readCurrentUptimeStreak(database)?.streakStartedAt).toBe(2 * DAY);
    expect(readRows().map((row) => row.endKind)).toEqual(["reboot", "crash", null]);
  });

  it("summarises a window: counts, longest streak and availability", async () => {
    await startBootSession(database, { bootId: "boot-a", bootedAt: 0 }, unknownEnd, 1000);
    touchBootSession(database, "boot-a", 4 * DAY);
    recordShutdownIntent(database, "boot-a", "reboot", 4 * DAY);
    await startBootSession(database, { bootId: "boot-b", bootedAt: 4 * DAY + 60_000 }, unknownEnd, 4 * DAY + 60_000);
    recordShutdownIntent(database, "boot-b", "shutdown", 6 * DAY);
    await startBootSession(database, { bootId: "boot-c", bootedAt: 7 * DAY }, unknownEnd, 7 * DAY);
    const summary = readUptimeSummary(database, "all", 8 * DAY);
    expect(summary.sessions).toHaveLength(3);
    expect(summary.rebootCount).toBe(1);
    expect(summary.shutdownCount).toBe(1);
    expect(summary.crashCount).toBe(0);
    expect(summary.longestStreakMilliseconds).toBe(6 * DAY);
    expect(summary.availabilityPercent).toBeCloseTo((100 * (8 * DAY - DAY - 60_000)) / (8 * DAY), 3);
  });
});
