import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, eq, lt, ne } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { sessions } from "@/lib/schema/authentication";

export const SESSION_COOKIE_NAME = "sl_session";
export const SESSION_DURATION_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;
const SESSION_RENEWAL_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;
const LAST_SEEN_WRITE_INTERVAL_MILLISECONDS = 60 * 1000;

export type SessionRecord = typeof sessions.$inferSelect;

/**
 * The value stored for a session token: HMAC-SHA256 with `SESSION_SECRET` when it is set,
 * otherwise SHA-256. The token itself is never stored.
 */
export function hashSessionToken(sessionToken: string): string {
  const sessionSecret = process.env.SESSION_SECRET;
  return sessionSecret ? createHmac("sha256", sessionSecret).update(sessionToken).digest("hex") : createHash("sha256").update(sessionToken).digest("hex");
}

/**
 * Creates a session and returns its token (32 random bytes, base64url) and expiry.
 */
export function createSession(database: ServerLabDatabase, { ipAddress, userAgent }: { ipAddress: string | null; userAgent: string | null }) {
  const sessionToken = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + SESSION_DURATION_MILLISECONDS;
  database.insert(sessions).values({ idHash: hashSessionToken(sessionToken), createdAt: now, expiresAt, lastSeen: now, ipAddress, userAgent }).run();
  return { sessionToken, expiresAt };
}

/**
 * Looks up a session by token. Returns null when it is unknown or expired. Sliding expiry: a
 * session used within a day of expiring is extended by `SESSION_DURATION_MILLISECONDS`, and
 * `renewedExpiresAt` tells the caller to refresh the cookie.
 */
export function validateSession(database: ServerLabDatabase, sessionToken: string): { session: SessionRecord; renewedExpiresAt: number | null } | null {
  const idHash = hashSessionToken(sessionToken);
  const session = database.select().from(sessions).where(eq(sessions.idHash, idHash)).get();
  const now = Date.now();
  if (!session) return null;
  if (session.expiresAt <= now) {
    database.delete(sessions).where(eq(sessions.idHash, idHash)).run();
    return null;
  }
  const shouldRenew = session.expiresAt - now < SESSION_RENEWAL_WINDOW_MILLISECONDS;
  const renewedExpiresAt = shouldRenew ? now + SESSION_DURATION_MILLISECONDS : null;
  if (shouldRenew || now - session.lastSeen > LAST_SEEN_WRITE_INTERVAL_MILLISECONDS) {
    database
      .update(sessions)
      .set({ lastSeen: now, ...(renewedExpiresAt ? { expiresAt: renewedExpiresAt } : {}) })
      .where(eq(sessions.idHash, idHash))
      .run();
  }
  return { session, renewedExpiresAt };
}

/**
 * Deletes one session by token.
 */
export function revokeSessionByToken(database: ServerLabDatabase, sessionToken: string): void {
  database.delete(sessions).where(eq(sessions.idHash, hashSessionToken(sessionToken))).run();
}

/**
 * Deletes one session by its stored hash (the Settings page lists hashes, never tokens).
 */
export function revokeSessionByHash(database: ServerLabDatabase, idHash: string): void {
  database.delete(sessions).where(eq(sessions.idHash, idHash)).run();
}

/**
 * Deletes every session except `keptIdHash` (used after a password change).
 */
export function revokeOtherSessions(database: ServerLabDatabase, keptIdHash: string | null): void {
  if (keptIdHash) database.delete(sessions).where(ne(sessions.idHash, keptIdHash)).run();
  else database.delete(sessions).run();
}

/**
 * Removes expired sessions.
 */
export function pruneExpiredSessions(database: ServerLabDatabase): void {
  database.delete(sessions).where(and(lt(sessions.expiresAt, Date.now()))).run();
}
