"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/authentication-actions";
import { ALERT_TEST_REQUEST_KEY, EVENT_KINDS, THRESHOLD_METRICS, type AlertTestRequest } from "@/lib/alerts/alert-definitions";
import { requireSession } from "@/lib/authentication/require-session";
import { getDatabase } from "@/lib/database/client";
import { writeSetting } from "@/lib/database/key-value";
import { alertRules } from "@/lib/schema/alerts";

const channelSchema = z.enum(["inapp", "ntfy", "discord", "telegram"]);

const alertRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("threshold"),
    name: z.string().trim().min(1, "Name is required").max(80),
    metric: z.enum(Object.keys(THRESHOLD_METRICS) as [keyof typeof THRESHOLD_METRICS, ...(keyof typeof THRESHOLD_METRICS)[]]),
    entity: z.string().trim().max(200).optional(),
    operator: z.enum([">", "<"]),
    threshold: z.coerce.number().finite(),
    forSeconds: z.coerce.number().int().min(0).max(86_400),
    cooldownSeconds: z.coerce.number().int().min(0).max(7 * 86_400),
    channels: z.array(channelSchema).min(1, "Pick at least one channel"),
  }),
  z.object({
    kind: z.literal("event"),
    name: z.string().trim().min(1, "Name is required").max(80),
    event: z.enum(Object.keys(EVENT_KINDS) as [keyof typeof EVENT_KINDS, ...(keyof typeof EVENT_KINDS)[]]),
    parameters: z.record(z.string(), z.union([z.string().max(200), z.number()])).default({}),
    cooldownSeconds: z.coerce.number().int().min(0).max(7 * 86_400),
    channels: z.array(channelSchema).min(1, "Pick at least one channel"),
  }),
]);

export type AlertRuleFormValues = z.input<typeof alertRuleSchema>;

/**
 * Creates (`ruleId` null) or updates an alert rule. The collector reads rules on every
 * evaluation, so changes apply within one sample interval.
 */
export async function saveAlertRule(ruleId: number | null, formValues: AlertRuleFormValues): Promise<ActionResult> {
  await requireSession("/alerts");
  const parsed = alertRuleSchema.safeParse(formValues);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Invalid rule." };
  const rule = parsed.data;
  const values =
    rule.kind === "threshold"
      ? { name: rule.name, kind: rule.kind, metric: rule.metric, entity: rule.entity || null, operator: rule.operator, threshold: rule.threshold, forSeconds: rule.forSeconds, event: null, parameters: {}, cooldownSeconds: rule.cooldownSeconds, channels: rule.channels }
      : { name: rule.name, kind: rule.kind, metric: null, entity: null, operator: null, threshold: null, forSeconds: 0, event: rule.event, parameters: rule.parameters, cooldownSeconds: rule.cooldownSeconds, channels: rule.channels };
  const database = getDatabase();
  if (ruleId === null) database.insert(alertRules).values(values).run();
  else database.update(alertRules).set(values).where(eq(alertRules.id, ruleId)).run();
  revalidatePath("/alerts");
  return { successMessage: ruleId === null ? "Rule created." : "Rule saved." };
}

/**
 * Turns a rule on or off.
 */
export async function setAlertRuleEnabled(ruleId: number, isEnabled: boolean): Promise<ActionResult> {
  await requireSession("/alerts");
  getDatabase().update(alertRules).set({ isEnabled }).where(eq(alertRules.id, ruleId)).run();
  revalidatePath("/alerts");
  return { successMessage: isEnabled ? "Rule enabled." : "Rule disabled." };
}

/**
 * Deletes a rule (its past events stay in the history).
 */
export async function deleteAlertRule(ruleId: number): Promise<ActionResult> {
  await requireSession("/alerts");
  getDatabase().delete(alertRules).where(eq(alertRules.id, ruleId)).run();
  revalidatePath("/alerts");
  return { successMessage: "Rule deleted." };
}

/**
 * Asks the collector to send a test notification (the web process has no outbound network
 * access by design). The result appears in Settings within a few seconds.
 */
export async function requestTestNotification(channel: AlertTestRequest["channel"]): Promise<ActionResult> {
  await requireSession("/settings");
  if (!["ntfy", "discord", "telegram"].includes(channel)) return { errorMessage: "Unknown channel." };
  writeSetting(getDatabase(), ALERT_TEST_REQUEST_KEY, { requestId: `${Date.now()}-${channel}`, channel, requestedAt: Date.now() } satisfies AlertTestRequest);
  return { successMessage: `Test requested for ${channel}.` };
}
