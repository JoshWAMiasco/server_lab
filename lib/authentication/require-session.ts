import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/database/client";
import { adminAccount } from "@/lib/schema/authentication";
import { SESSION_COOKIE_NAME, validateSession, type SessionRecord } from "@/lib/authentication/session-store";

/**
 * Whether the admin account has been created yet.
 */
export function hasAdminAccount(): boolean {
  return Boolean(getDatabase().select({ id: adminAccount.id }).from(adminAccount).get());
}

/**
 * Returns the current session, or null. Reads the `sl_session` cookie and checks it against the
 * `sessions` table; the proxy only checks that the cookie exists.
 */
export async function readSession(): Promise<SessionRecord | null> {
  const sessionToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return null;
  return validateSession(getDatabase(), sessionToken)?.session ?? null;
}

/**
 * The server-side guard for dashboard pages and server actions: redirects to `/setup` before the
 * admin exists and to `/login` without a valid session.
 */
export async function requireSession(nextPath = "/"): Promise<SessionRecord> {
  if (!hasAdminAccount()) redirect("/setup");
  const session = await readSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return session;
}
