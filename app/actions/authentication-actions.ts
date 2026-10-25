"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MINIMUM_PASSWORD_LENGTH, hashPassword, verifyPassword } from "@/lib/authentication/password";
import { readClientAddress, readUserAgent, isSecureCookie } from "@/lib/authentication/request-context";
import { hasAdminAccount, requireSession } from "@/lib/authentication/require-session";
import { readLockedUntil, recordFailedAttempt, recordSuccessfulAttempt } from "@/lib/authentication/login-throttle";
import { SESSION_COOKIE_NAME, createSession, revokeOtherSessions, revokeSessionByHash, revokeSessionByToken } from "@/lib/authentication/session-store";
import { readSafeNextPath } from "@/lib/authentication/safe-next-path";
import { completeSetupToken, isSetupTokenValid } from "@/lib/authentication/setup-token";
import { getDatabase } from "@/lib/database/client";
import { adminAccount } from "@/lib/schema/authentication";
import { storeLoginEvent } from "@/lib/watcher/login-event-store";

export interface ActionResult {
  errorMessage?: string;
  successMessage?: string;
}

const passwordSchema = z.string().min(MINIMUM_PASSWORD_LENGTH, `Use at least ${MINIMUM_PASSWORD_LENGTH} characters`).max(256);

async function startSession(): Promise<void> {
  const { sessionToken, expiresAt } = createSession(getDatabase(), { ipAddress: await readClientAddress(), userAgent: await readUserAgent() });
  (await cookies()).set(SESSION_COOKIE_NAME, sessionToken, { httpOnly: true, secure: isSecureCookie(), sameSite: "strict", path: "/", expires: new Date(expiresAt) });
}

function formatLockout(lockedUntil: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;
}

/**
 * Signs the admin in. Every attempt is written to the User Watcher (`channel: web`), and failures
 * count toward the per-IP lockout.
 */
export async function signIn(formValues: { password: string; nextPath?: string }): Promise<ActionResult> {
  const database = getDatabase();
  const ipAddress = (await readClientAddress()) ?? "unknown";
  const lockedUntil = readLockedUntil(database, ipAddress);
  if (lockedUntil) return { errorMessage: `Locked, try again in ${formatLockout(lockedUntil)}.` };

  const admin = database.select().from(adminAccount).where(eq(adminAccount.id, 1)).get();
  if (!admin) redirect("/setup");
  const isValid = await verifyPassword(admin.passwordHash, String(formValues.password ?? ""));
  const loginTimestamp = Date.now();
  await storeLoginEvent(database, {
    timestamp: loginTimestamp,
    channel: "web",
    username: "admin",
    result: isValid ? "success" : "failure",
    method: "web",
    sourceAddress: ipAddress === "unknown" ? null : ipAddress,
    sourcePort: null,
    raw: `ServerLab web sign-in ${isValid ? "succeeded" : "failed"} from ${ipAddress}`,
  });

  if (!isValid) {
    const newLockedUntil = recordFailedAttempt(database, ipAddress);
    return { errorMessage: newLockedUntil ? `Locked, try again in ${formatLockout(newLockedUntil)}.` : "Wrong password." };
  }
  recordSuccessfulAttempt(database, ipAddress);
  await startSession();
  redirect(readSafeNextPath(formValues.nextPath));
}

/**
 * Creates the admin account on first run. Needs the one-time setup token from `install.sh`.
 */
export async function completeSetup(formValues: { setupToken: string; password: string; passwordConfirmation: string }): Promise<ActionResult> {
  if (hasAdminAccount()) redirect("/login");
  const parsedPassword = passwordSchema.safeParse(formValues.password);
  if (!parsedPassword.success) return { errorMessage: parsedPassword.error.issues[0]?.message ?? "Invalid password." };
  if (formValues.password !== formValues.passwordConfirmation) return { errorMessage: "Passwords do not match." };
  const database = getDatabase();
  const ipAddress = (await readClientAddress()) ?? "unknown";
  const lockedUntil = readLockedUntil(database, ipAddress);
  if (lockedUntil) return { errorMessage: `Locked, try again in ${formatLockout(lockedUntil)}.` };
  if (!isSetupTokenValid(String(formValues.setupToken ?? ""))) {
    const newLockedUntil = recordFailedAttempt(database, ipAddress);
    return { errorMessage: newLockedUntil ? `Locked, try again in ${formatLockout(newLockedUntil)}.` : "The setup token is not valid." };
  }
  recordSuccessfulAttempt(database, ipAddress);

  const now = Date.now();
  database.insert(adminAccount).values({ id: 1, passwordHash: await hashPassword(parsedPassword.data), createdAt: now, updatedAt: now }).onConflictDoNothing().run();
  completeSetupToken();
  await startSession();
  redirect("/");
}

/**
 * Signs out and deletes the session row.
 */
export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) revokeSessionByToken(getDatabase(), sessionToken);
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

/**
 * Changes the admin password (current password required) and signs out every other session.
 */
export async function changePassword(formValues: { currentPassword: string; newPassword: string; newPasswordConfirmation: string }): Promise<ActionResult> {
  const session = await requireSession("/settings");
  const database = getDatabase();
  const admin = database.select().from(adminAccount).where(eq(adminAccount.id, 1)).get();
  if (!admin || !(await verifyPassword(admin.passwordHash, String(formValues.currentPassword ?? "")))) return { errorMessage: "The current password is wrong." };
  const parsedPassword = passwordSchema.safeParse(formValues.newPassword);
  if (!parsedPassword.success) return { errorMessage: parsedPassword.error.issues[0]?.message ?? "Invalid password." };
  if (formValues.newPassword !== formValues.newPasswordConfirmation) return { errorMessage: "Passwords do not match." };
  database.update(adminAccount).set({ passwordHash: await hashPassword(parsedPassword.data), updatedAt: Date.now() }).where(eq(adminAccount.id, 1)).run();
  revokeOtherSessions(database, session.idHash);
  return { successMessage: "Password changed. Other sessions were signed out." };
}

/**
 * Revokes one session from the Settings list.
 */
export async function revokeSession(idHash: string): Promise<ActionResult> {
  await requireSession("/settings");
  revokeSessionByHash(getDatabase(), idHash);
  return { successMessage: "Session revoked." };
}
