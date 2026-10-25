import { eq } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { loginThrottle } from "@/lib/schema/authentication";

export const MAXIMUM_FAILURES = 5;
export const FAILURE_WINDOW_MILLISECONDS = 15 * 60 * 1000;
const BASE_LOCKOUT_MILLISECONDS = 15 * 60 * 1000;
const MAXIMUM_LOCKOUT_MILLISECONDS = 24 * 60 * 60 * 1000;

/**
 * When the IP may try again, or null when it is not locked.
 */
export function readLockedUntil(database: ServerLabDatabase, ipAddress: string, now = Date.now()): number | null {
  const row = database.select().from(loginThrottle).where(eq(loginThrottle.ipAddress, ipAddress)).get();
  return row?.lockedUntil && row.lockedUntil > now ? row.lockedUntil : null;
}

/**
 * Counts a failed sign-in. The 5th failure within 15 minutes locks the IP for 15 minutes; each
 * further lockout doubles, up to 24 hours. Returns the new lock expiry, if any.
 */
export function recordFailedAttempt(database: ServerLabDatabase, ipAddress: string, now = Date.now()): number | null {
  const row = database.select().from(loginThrottle).where(eq(loginThrottle.ipAddress, ipAddress)).get();
  const isWindowExpired = !row || now - row.windowStartedAt > FAILURE_WINDOW_MILLISECONDS;
  const failures = isWindowExpired ? 1 : row.failures + 1;
  const windowStartedAt = isWindowExpired ? now : row.windowStartedAt;
  let lockoutCount = row?.lockoutCount ?? 0;
  let lockedUntil: number | null = null;
  if (failures >= MAXIMUM_FAILURES) {
    lockedUntil = now + Math.min(MAXIMUM_LOCKOUT_MILLISECONDS, BASE_LOCKOUT_MILLISECONDS * 2 ** lockoutCount);
    lockoutCount += 1;
  }
  const values = { ipAddress, failures: lockedUntil ? 0 : failures, windowStartedAt: lockedUntil ? now : windowStartedAt, lockoutCount, lockedUntil };
  database.insert(loginThrottle).values(values).onConflictDoUpdate({ target: loginThrottle.ipAddress, set: values }).run();
  return lockedUntil;
}

/**
 * Clears the failure counter after a successful sign-in (the lockout history is kept).
 */
export function recordSuccessfulAttempt(database: ServerLabDatabase, ipAddress: string): void {
  database.update(loginThrottle).set({ failures: 0, lockedUntil: null }).where(eq(loginThrottle.ipAddress, ipAddress)).run();
}

/**
 * Runs a slow check (argon2) under the lockout. The attempt is counted as a failure before the
 * check starts, synchronously, so concurrent requests from one IP see it and at most
 * MAXIMUM_FAILURES checks run per window. A successful check clears the count again.
 */
export async function verifyWithThrottle(database: ServerLabDatabase, ipAddress: string, verify: () => Promise<boolean>): Promise<{ isValid: boolean; lockedUntil: number | null }> {
  const lockedUntil = readLockedUntil(database, ipAddress);
  if (lockedUntil) return { isValid: false, lockedUntil };
  const reservedLockedUntil = recordFailedAttempt(database, ipAddress);
  if (await verify()) {
    recordSuccessfulAttempt(database, ipAddress);
    return { isValid: true, lockedUntil: null };
  }
  return { isValid: false, lockedUntil: reservedLockedUntil };
}
