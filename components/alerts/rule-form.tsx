"use client";

import { useState, type FormEvent } from "react";
import { saveAlertRule } from "@/app/actions/alert-rule-actions";
import { ModalBody, ModalFooter } from "@/components/interactive/modal";
import { showToastNotification } from "@/components/interactive/toast-notification";
import { Button } from "@/components/primitives/button";
import { FormCheckbox } from "@/components/primitives/form-check";
import { FormErrorMessage, FormField } from "@/components/primitives/form-field";
import { FormInput } from "@/components/primitives/form-input";
import { FormSelect } from "@/components/primitives/form-select";
import { ALERT_CHANNELS, EVENT_KINDS, THRESHOLD_METRICS } from "@/lib/alerts/alert-definitions";
import type { AlertRuleRecord } from "@/lib/queries/alert-queries";
import type { AlertChannel } from "@/lib/schema/alerts";

const CHANNEL_LABELS: Record<AlertChannel, string> = { inapp: "In-app", ntfy: "ntfy", discord: "Discord", telegram: "Telegram" };

const EVENT_PARAMETER_FIELDS: Record<string, { key: string; label: string; helpText: string; isNumeric: boolean }[]> = {
  login_failed_burst: [
    { key: "count", label: "Failed logins", helpText: "From one IP within the window.", isNumeric: true },
    { key: "windowSeconds", label: "Window (seconds)", helpText: "600 = 10 minutes.", isNumeric: true },
  ],
  item_exposed: [{ key: "allowedPorts", label: "Allowed ports", helpText: "Comma-separated ports that may listen on all interfaces (e.g. 22).", isNumeric: false }],
  tls_cert_expiring: [{ key: "days", label: "Days before expiry", helpText: "Fires when the certificate expires sooner than this.", isNumeric: true }],
  collector_offline: [{ key: "seconds", label: "Silence (seconds)", helpText: "Shown in-app by the web process.", isNumeric: true }],
};

/**
 * The alert rule editor: a threshold rule (metric, operator, value, duration) or an event rule
 * (brute force, new country, service down/exposed, TLS expiry), plus cooldown and channels.
 *
 * @example
 * <RuleForm rule={rule} configuredChannels={{ ntfy: true, discord: false, telegram: false }} onDone={close} />
 */
export function RuleForm({ rule, configuredChannels, onDone }: { rule: AlertRuleRecord | null; configuredChannels: Record<"ntfy" | "discord" | "telegram", boolean>; onDone: () => void }) {
  const [kind, setKind] = useState<"threshold" | "event">(rule?.kind ?? "threshold");
  const [name, setName] = useState(rule?.name ?? "");
  const [metric, setMetric] = useState(rule?.metric ?? "cpu_pct");
  const [entity, setEntity] = useState(rule?.entity ?? "");
  const [operator, setOperator] = useState<">" | "<">(rule?.operator ?? ">");
  const [threshold, setThreshold] = useState(String(rule?.threshold ?? 90));
  const [forSeconds, setForSeconds] = useState(String(rule?.forSeconds ?? 60));
  const [event, setEvent] = useState(rule?.event ?? "login_failed_burst");
  const [parameters, setParameters] = useState<Record<string, string>>(Object.fromEntries(Object.entries(rule?.parameters ?? {}).map(([key, value]) => [key, String(value)])));
  const [cooldownSeconds, setCooldownSeconds] = useState(String(rule?.cooldownSeconds ?? 1800));
  const [channels, setChannels] = useState<AlertChannel[]>(rule?.channels ?? ["inapp"]);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setIsSaving(true);
    const parameterFields = EVENT_PARAMETER_FIELDS[event] ?? [];
    const result = await saveAlertRule(
      rule?.id ?? null,
      kind === "threshold"
        ? { kind, name, metric: metric as keyof typeof THRESHOLD_METRICS, entity, operator, threshold, forSeconds, cooldownSeconds, channels }
        : { kind, name, event: event as keyof typeof EVENT_KINDS, parameters: Object.fromEntries(parameterFields.filter((field) => parameters[field.key] !== undefined && parameters[field.key] !== "").map((field) => [field.key, field.isNumeric ? Number(parameters[field.key]) : String(parameters[field.key])])), cooldownSeconds, channels },
    );
    setIsSaving(false);
    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      return;
    }
    showToastNotification({ title: result.successMessage ?? "Saved." });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <ModalBody className="flex flex-1 flex-col gap-4">
        <FormField label="Name" htmlFor="rule-name">
          <FormInput id="rule-name" value={name} onChange={(changeEvent) => setName(changeEvent.target.value)} placeholder="High CPU" required />
        </FormField>
        <FormField label="Type" htmlFor="rule-kind">
          <FormSelect id="rule-kind" value={kind} onChange={(changeEvent) => setKind(changeEvent.target.value as "threshold" | "event")} options={[{ label: "Threshold on a metric", value: "threshold" }, { label: "Event", value: "event" }]} disabled={Boolean(rule)} />
        </FormField>
        {kind === "threshold" ? (
          <>
            <div className="grid grid-cols-[1fr_5rem_7rem] gap-3">
              <FormField label="Metric" htmlFor="rule-metric">
                <FormSelect id="rule-metric" value={metric} onChange={(changeEvent) => setMetric(changeEvent.target.value)} options={Object.entries(THRESHOLD_METRICS).map(([value, definition]) => ({ value, label: `${definition.label}${definition.unit ? ` (${definition.unit})` : ""}` }))} />
              </FormField>
              <FormField label="Is" htmlFor="rule-operator">
                <FormSelect id="rule-operator" value={operator} onChange={(changeEvent) => setOperator(changeEvent.target.value as ">" | "<")} options={[{ value: ">", label: ">" }, { value: "<", label: "<" }]} />
              </FormField>
              <FormField label="Value" htmlFor="rule-threshold">
                <FormInput id="rule-threshold" type="number" step="any" value={threshold} onChange={(changeEvent) => setThreshold(changeEvent.target.value)} required />
              </FormField>
            </div>
            <FormField label="Only for" htmlFor="rule-entity" helpText="Optional: a mount point (/), GPU index (0) or app key (docker:jellyfin). Empty means every one, each tracked separately.">
              <FormInput id="rule-entity" value={entity} onChange={(changeEvent) => setEntity(changeEvent.target.value)} placeholder="any" />
            </FormField>
            <FormField label="For at least (seconds)" htmlFor="rule-for" helpText="The condition must hold this long before the alert fires.">
              <FormInput id="rule-for" type="number" min={0} value={forSeconds} onChange={(changeEvent) => setForSeconds(changeEvent.target.value)} />
            </FormField>
          </>
        ) : (
          <>
            <FormField label="Event" htmlFor="rule-event">
              <FormSelect id="rule-event" value={event} onChange={(changeEvent) => setEvent(changeEvent.target.value)} options={Object.entries(EVENT_KINDS).map(([value, label]) => ({ value, label }))} />
            </FormField>
            {(EVENT_PARAMETER_FIELDS[event] ?? []).map((field) => (
              <FormField key={field.key} label={field.label} htmlFor={`rule-parameter-${field.key}`} helpText={field.helpText}>
                <FormInput id={`rule-parameter-${field.key}`} type={field.isNumeric ? "number" : "text"} value={parameters[field.key] ?? ""} onChange={(changeEvent) => setParameters((previous) => ({ ...previous, [field.key]: changeEvent.target.value }))} />
              </FormField>
            ))}
          </>
        )}
        <FormField label="Cooldown (seconds)" htmlFor="rule-cooldown" helpText="Minimum gap between repeat notifications for the same rule and entity.">
          <FormInput id="rule-cooldown" type="number" min={0} value={cooldownSeconds} onChange={(changeEvent) => setCooldownSeconds(changeEvent.target.value)} />
        </FormField>
        <FormField label="Channels">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {ALERT_CHANNELS.map((channel) => (
              <FormCheckbox
                key={channel}
                id={`rule-channel-${channel}`}
                label={`${CHANNEL_LABELS[channel]}${channel !== "inapp" && !configuredChannels[channel] ? " (not configured)" : ""}`}
                checked={channels.includes(channel)}
                onChange={(changeEvent) => setChannels((previous) => (changeEvent.target.checked ? [...previous, channel] : previous.filter((existing) => existing !== channel)))}
              />
            ))}
          </div>
        </FormField>
        <FormErrorMessage message={errorMessage} />
      </ModalBody>
      <ModalFooter>
        <Button variant="outline-secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save rule"}
        </Button>
      </ModalFooter>
    </form>
  );
}
