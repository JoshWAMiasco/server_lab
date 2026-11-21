import { desc } from "drizzle-orm";
import type { BootEndKind } from "@/collector/types";
import type { ServerLabDatabase } from "@/lib/database/client";
import { bootSessions } from "@/lib/schema/system";

const DAY_MILLISECONDS = 86_400_000;

export const UPTIME_RANGES = { "7d": 7 * DAY_MILLISECONDS, "30d": 30 * DAY_MILLISECONDS, "90d": 90 * DAY_MILLISECONDS, all: null } as const;
export type UptimeRange = keyof typeof UPTIME_RANGES;

export interface UptimeStreak {
  /** When the current uptime streak began: the last power-on after a shutdown or crash. */
  streakStartedAt: number;
  /** When the current kernel booted (reboots inside the streak move this, not the streak). */
  bootedAt: number;
  /** Reboots since the streak began. */
  rebootCount: number;
  /** The latest reboot inside the streak, or null when the streak has had none. */
  lastRebootAt: number | null;
}

export interface BootSessionRow {
  id: number;
  bootId: string;
  bootedAt: number;
  lastSeenAt: number;
  endedAt: number | null;
  endKind: BootEndKind | null;
  streakStartedAt: number;
}

export interface UptimeSummary {
  rangeStartedAt: number;
  rangeEndedAt: number;
  current: UptimeStreak | null;
  /** Boots that overlap the range, newest first. */
  sessions: BootSessionRow[];
  longestStreakMilliseconds: number;
  rebootCount: number;
  shutdownCount: number;
  crashCount: number;
  /** Share of the range the host was up (0–100), or null when nothing was recorded yet. */
  availabilityPercent: number | null;
}

function readAllSessions(database: ServerLabDatabase): BootSessionRow[] {
  return database.select().from(bootSessions).orderBy(desc(bootSessions.bootedAt)).all() as BootSessionRow[];
}

function buildStreak(sessions: readonly BootSessionRow[]): UptimeStreak | null {
  const currentSession = sessions[0];
  if (!currentSession) return null;
  const rebootsInStreak = sessions.filter((session) => session.endKind === "reboot" && session.streakStartedAt === currentSession.streakStartedAt);
  return {
    streakStartedAt: currentSession.streakStartedAt,
    bootedAt: currentSession.bootedAt,
    rebootCount: rebootsInStreak.length,
    lastRebootAt: rebootsInStreak.length > 0 ? currentSession.bootedAt : null,
  };
}

/**
 * The current uptime streak: reboots keep it running, a shutdown or crash starts a new one. Null
 * before the collector has recorded its first boot.
 *
 * @example
 * const streak = readCurrentUptimeStreak(database);
 * const uptimeMilliseconds = streak ? Date.now() - streak.streakStartedAt : 0;
 */
export function readCurrentUptimeStreak(database: ServerLabDatabase): UptimeStreak | null {
  return buildStreak(database.select().from(bootSessions).orderBy(desc(bootSessions.bootedAt)).limit(500).all() as BootSessionRow[]);
}

/**
 * Everything the Uptime page shows for a window: the sessions in it, counts of how boots ended,
 * the longest streak and availability (time up ÷ time recorded in the window).
 *
 * @example
 * const summary = readUptimeSummary(database, "30d");
 */
export function readUptimeSummary(database: ServerLabDatabase, range: UptimeRange, now = Date.now()): UptimeSummary {
  const allSessions = readAllSessions(database);
  const span = UPTIME_RANGES[range];
  const oldestBoot = allSessions.at(-1)?.bootedAt ?? now;
  const rangeStartedAt = span === null ? oldestBoot : now - span;
  const sessionEnd = (session: BootSessionRow, sessionIndex: number) => (sessionIndex === 0 && session.endedAt === null ? now : (session.endedAt ?? session.lastSeenAt));
  const sessions = allSessions.filter((session, sessionIndex) => sessionEnd(session, sessionIndex) >= rangeStartedAt);

  const streakBounds = new Map<number, { start: number; end: number }>();
  allSessions.forEach((session, sessionIndex) => {
    const bounds = streakBounds.get(session.streakStartedAt) ?? { start: session.streakStartedAt, end: 0 };
    bounds.end = Math.max(bounds.end, sessionEnd(session, sessionIndex));
    streakBounds.set(session.streakStartedAt, bounds);
  });
  const longestStreakMilliseconds = Math.max(0, ...[...streakBounds.values()].filter((bounds) => bounds.end >= rangeStartedAt).map((bounds) => bounds.end - bounds.start));

  const endedInRange = sessions.filter((session) => session.endedAt !== null && session.endedAt >= rangeStartedAt);
  const countEnds = (endKind: BootEndKind) => endedInRange.filter((session) => session.endKind === endKind).length;

  const recordedStart = Math.max(rangeStartedAt, oldestBoot);
  const upMilliseconds = sessions.reduce((total, session) => {
    const sessionIndex = allSessions.indexOf(session);
    return total + Math.max(0, Math.min(now, sessionEnd(session, sessionIndex)) - Math.max(recordedStart, session.bootedAt));
  }, 0);
  const recordedMilliseconds = now - recordedStart;

  return {
    rangeStartedAt,
    rangeEndedAt: now,
    current: buildStreak(allSessions),
    sessions,
    longestStreakMilliseconds,
    rebootCount: countEnds("reboot"),
    shutdownCount: countEnds("shutdown"),
    crashCount: countEnds("crash"),
    availabilityPercent: sessions.length > 0 && recordedMilliseconds > 0 ? Math.min(100, (100 * upMilliseconds) / recordedMilliseconds) : null,
  };
}
