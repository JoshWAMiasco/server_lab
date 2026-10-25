import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLockedUntil, recordFailedAttempt, recordSuccessfulAttempt, verifyWithThrottle } from "@/lib/authentication/login-throttle";
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

  it("counts concurrent attempts before verifying, so they cannot outrun the lockout", async () => {
    let verifyCount = 0;
    const slowWrongPassword = async () => {
      verifyCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return false;
    };
    const results = await Promise.all(Array.from({ length: 10 }, () => verifyWithThrottle(database, "203.0.113.20", slowWrongPassword)));
    expect(verifyCount).toBe(5);
    expect(results.filter((result) => result.lockedUntil !== null)).toHaveLength(6);
    expect(readLockedUntil(database, "203.0.113.20")).not.toBeNull();
  });

  it("clears the reserved attempt when the password is right", async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) recordFailedAttempt(database, "203.0.113.21");
    expect(await verifyWithThrottle(database, "203.0.113.21", async () => true)).toEqual({ isValid: true, lockedUntil: null });
    for (let attempt = 1; attempt <= 4; attempt += 1) expect(recordFailedAttempt(database, "203.0.113.21")).toBeNull();
  });

  it("does not verify while locked", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) recordFailedAttempt(database, "203.0.113.22");
    let wasVerified = false;
    const result = await verifyWithThrottle(database, "203.0.113.22", async () => (wasVerified = true));
    expect(wasVerified).toBe(false);
    expect(result.isValid).toBe(false);
    expect(result.lockedUntil).not.toBeNull();
  });
});
