import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLockedUntil, recordFailedAttempt, recordSuccessfulAttempt } from "@/lib/authentication/login-throttle";
import { hashPassword, verifyPassword } from "@/lib/authentication/password";
import { createSession, hashSessionToken, revokeSessionByToken, validateSession } from "@/lib/authentication/session-store";
import type { ServerLabDatabase } from "@/lib/database/client";
import { sessions } from "@/lib/schema/authentication";
import { createTemporaryDatabase } from "@/lib/testing/temporary-database";

describe("authentication", () => {
  let database: ServerLabDatabase;
  let remove: () => void;
  beforeEach(() => ({ database, remove } = createTemporaryDatabase()));
  afterEach(() => remove());

  it("hashes passwords with argon2id and verifies them", async () => {
    const passwordHash = await hashPassword("correct horse battery");
    expect(passwordHash.startsWith("$argon2id$v=19$m=65536,t=3,p=1$")).toBe(true);
    expect(await verifyPassword(passwordHash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(passwordHash, "wrong")).toBe(false);
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("stores only a hash of the session token", () => {
    const { sessionToken } = createSession(database, { ipAddress: "100.64.0.1", userAgent: "test" });
    const storedRows = database.select().from(sessions).all();
    expect(storedRows).toHaveLength(1);
    expect(storedRows[0]?.idHash).toBe(hashSessionToken(sessionToken));
    expect(JSON.stringify(storedRows)).not.toContain(sessionToken);
    expect(validateSession(database, sessionToken)).not.toBeNull();
    revokeSessionByToken(database, sessionToken);
    expect(validateSession(database, sessionToken)).toBeNull();
  });

  it("rejects expired sessions", () => {
    const { sessionToken } = createSession(database, { ipAddress: null, userAgent: null });
    database.update(sessions).set({ expiresAt: Date.now() - 1 }).run();
    expect(validateSession(database, sessionToken)).toBeNull();
  });

  it("locks an IP on the 5th failure within 15 minutes, doubling each time", () => {
    const now = 1_000_000_000;
    for (let attempt = 1; attempt <= 4; attempt += 1) expect(recordFailedAttempt(database, "203.0.113.9", now + attempt)).toBeNull();
    const firstLock = recordFailedAttempt(database, "203.0.113.9", now + 5);
    expect(firstLock).toBe(now + 5 + 15 * 60_000);
    expect(readLockedUntil(database, "203.0.113.9", now + 6)).toBe(firstLock);
    const afterLock = (firstLock ?? 0) + 1;
    for (let attempt = 1; attempt <= 4; attempt += 1) recordFailedAttempt(database, "203.0.113.9", afterLock + attempt);
    expect(recordFailedAttempt(database, "203.0.113.9", afterLock + 5)).toBe(afterLock + 5 + 30 * 60_000);
    expect(readLockedUntil(database, "198.51.100.1", now)).toBeNull();
  });

  it("clears the failure count after a successful sign-in", () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) recordFailedAttempt(database, "203.0.113.10");
    recordSuccessfulAttempt(database, "203.0.113.10");
    expect(recordFailedAttempt(database, "203.0.113.10")).toBeNull();
  });
});
