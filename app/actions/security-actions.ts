"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions/authentication-actions";
import { requireSession } from "@/lib/authentication/require-session";
import { getDatabase } from "@/lib/database/client";
import { readCapability, writeSetting } from "@/lib/database/key-value";
import { hostActionRequests } from "@/lib/schema/security";
import { checkLockoutRisk } from "@/lib/security/lockout-guard";
import { buildActionCommands, describeSecurityAction, formatCommandLine } from "@/lib/security/security-commands";
import { SECURITY_CAPABILITY_KEY, SECURITY_REFRESH_REQUEST_KEY, type SecurityState } from "@/lib/security/security-types";
import { securityActionSchema } from "@/lib/security/security-validation";

export interface SecurityActionResult extends ActionResult {
  /** Set when the change was refused because it could lock you out; the page asks for confirmation. */
  lockoutReason?: string;
}

const MAXIMUM_PENDING_REQUESTS = 20;

/**
 * Queues one firewall or fail2ban change for the collector and its root helper. The input is
 * validated with the same schema the helper uses, and changes that could cut off remote access are
 * refused unless `confirmLockoutRisk` is set.
 */
export async function requestSecurityAction(input: unknown, { confirmLockoutRisk = false }: { confirmLockoutRisk?: boolean } = {}): Promise<SecurityActionResult> {
  const kind = typeof input === "object" && input !== null && "kind" in input ? String(input.kind) : "";
  await requireSession(kind.startsWith("fail2ban") ? "/security/fail2ban" : "/security/firewall");
  const parsedAction = securityActionSchema.safeParse(input);
  if (!parsedAction.success) return { errorMessage: parsedAction.error.issues[0]?.message ?? "That change is not valid." };
  const action = parsedAction.data;
  if (action.kind === "snapshot") return { errorMessage: "Use the refresh button to reload the status." };

  const database = getDatabase();
  const state = readCapability<SecurityState | null>(database, SECURITY_CAPABILITY_KEY, null);
  if (!state) return { errorMessage: "The collector has not reported the firewall and fail2ban status yet. Is it running?" };
  if (state.helper === "not-installed" || state.helper === "failed") return { errorMessage: state.helperMessage ?? "Changes need the root helper. Re-run sudo ./deploy/install.sh." };
  if (action.kind.startsWith("fail2ban") && state.fail2ban.status !== "running") return { errorMessage: "fail2ban is not running on this server." };
  if (action.kind.startsWith("fail2ban") && "jail" in action && !state.fail2ban.jails.some((jail) => jail.name === action.jail)) return { errorMessage: `There is no jail named ${action.jail}.` };
  if (action.kind.startsWith("firewall") && state.firewall.status === "not-installed") return { errorMessage: "UFW is not installed on this server." };

  const lockout = checkLockoutRisk(state.firewall, action);
  if (lockout.isRisky && !confirmLockoutRisk) return { lockoutReason: lockout.reason ?? "This change could lock you out." };

  const pendingCount = database.select({ id: hostActionRequests.id }).from(hostActionRequests).where(inArray(hostActionRequests.status, ["pending", "running"])).all().length;
  if (pendingCount >= MAXIMUM_PENDING_REQUESTS) return { errorMessage: "Too many changes are waiting. Wait for them to finish, then try again." };

  const requestedAt = Date.now();
  const id = `${requestedAt}-${randomBytes(6).toString("hex")}`;
  database.insert(hostActionRequests).values({ id, kind: action.kind, action, summary: describeSecurityAction(action), status: "pending", requestedAt }).run();
  revalidatePath(action.kind.startsWith("fail2ban") ? "/security/fail2ban" : "/security/firewall");
  return { successMessage: `Queued: ${buildActionCommands(action).map((command) => formatCommandLine(command)).join(" && ")}` };
}

/**
 * Asks the collector to read UFW and fail2ban again now (it also does so every few minutes).
 */
export async function requestSecurityRefresh(): Promise<ActionResult> {
  await requireSession("/security/firewall");
  writeSetting(getDatabase(), SECURITY_REFRESH_REQUEST_KEY, Date.now());
  return { successMessage: "Refreshing…" };
}

/**
 * Removes a change that is still waiting (not yet started by the collector).
 */
export async function cancelSecurityAction(requestId: string): Promise<ActionResult> {
  await requireSession("/security/firewall");
  if (typeof requestId !== "string" || !/^[\w-]{8,64}$/.test(requestId)) return { errorMessage: "Unknown request." };
  const { changes } = getDatabase().delete(hostActionRequests).where(and(eq(hostActionRequests.id, requestId), eq(hostActionRequests.status, "pending"))).run();
  return changes > 0 ? { successMessage: "Cancelled." } : { errorMessage: "It already started, so it cannot be cancelled." };
}
