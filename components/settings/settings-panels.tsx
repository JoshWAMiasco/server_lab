"use client";

import { KeyRound, LogOut, Power, PowerOff, Send, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { requestTestNotification } from "@/app/actions/alert-rule-actions";
import { changePassword, revokeSession, type ActionResult } from "@/app/actions/authentication-actions";
import { purgeLoginHistory, requestGpuPowerMode, savePublicHostname, saveRetention } from "@/app/actions/settings-actions";
import { showToastNotification } from "@/components/interactive/toast-notification";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { FormErrorMessage, FormField } from "@/components/primitives/form-field";
import { FormInput } from "@/components/primitives/form-input";
import { PasswordInput } from "@/components/primitives/password-input";
import type { RetentionSettings } from "@/lib/database/retention";
import type { SettingsOverview } from "@/lib/queries/settings-queries";
import { formatRelativeTime } from "@/utilities/format-date";
import { formatBytes } from "@/utilities/format-number";

function SettingsSection({ id, title, description, children }: { id?: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24 p-6">
      <h2 className="text-base font-medium">{title}</h2>
      {description && <p className="mt-1 leading-relaxed text-foreground-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function useActionRunner() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>, onSuccess?: () => void) =>
    startTransition(async () => {
      setErrorMessage(undefined);
      const result = await action();
      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
        return;
      }
      showToastNotification({ title: result.successMessage ?? "Saved." });
      onSuccess?.();
      router.refresh();
    });
  return { errorMessage, isPending, run };
}

function PasswordSection() {
  const { errorMessage, isPending, run } = useActionRunner();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", newPasswordConfirmation: "" });
  const update = (key: keyof typeof values) => (changeEvent: { target: { value: string } }) => setValues((previous) => ({ ...previous, [key]: changeEvent.target.value }));
  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    run(() => changePassword(values), () => setValues({ currentPassword: "", newPassword: "", newPasswordConfirmation: "" }));
  };
  return (
    <SettingsSection id="password" title="Admin password" description="At least 12 characters. Changing it signs out every other session. Forgot it? Run sudo serverlab reset-password on the host.">
      <form onSubmit={submit} className="grid max-w-xl gap-4">
        <FormField label="Current password" htmlFor="current-password">
          <PasswordInput id="current-password" autoComplete="current-password" value={values.currentPassword} onChange={update("currentPassword")} required />
        </FormField>
        <FormField label="New password" htmlFor="new-password">
          <PasswordInput id="new-password" autoComplete="new-password" minLength={12} value={values.newPassword} onChange={update("newPassword")} required />
        </FormField>
        <FormField label="Confirm new password" htmlFor="new-password-confirmation">
          <PasswordInput id="new-password-confirmation" autoComplete="new-password" value={values.newPasswordConfirmation} onChange={update("newPasswordConfirmation")} required />
        </FormField>
        <FormErrorMessage message={errorMessage} />
        <div>
          <Button type="submit" variant="primary" disabled={isPending} leadingIcon={<KeyRound className="mr-2 h-4 w-4" />}>
            Change password
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

function SessionsSection({ sessions, currentIdHash }: { sessions: SettingsOverview["sessions"]; currentIdHash: string }) {
  const { run } = useActionRunner();
  return (
    <SettingsSection title="Active sessions" description="Every browser signed in as admin. Sessions last 7 days and extend while in use.">
      <div className="divide-y divide-dashed divide-line-strong/70">
        {sessions.map((session) => (
          <div key={session.idHash} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {session.ipAddress ?? "unknown IP"}
                {session.idHash === currentIdHash && <Badge tone="success">this browser</Badge>}
              </div>
              <div className="mt-0.5 truncate text-xs text-foreground-muted">{session.userAgent ?? "unknown browser"}</div>
            </div>
            <div className="text-xs text-foreground-subtle">last seen {formatRelativeTime(new Date(session.lastSeen).toISOString())}</div>
            {session.idHash !== currentIdHash && (
              <Button size="small" variant="outline-danger" onClick={() => run(() => revokeSession(session.idHash))} leadingIcon={<LogOut className="mr-1.5 h-3.5 w-3.5" />}>
                Revoke
              </Button>
            )}
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

function HostnameSection({ override, detected }: { override: string; detected: string }) {
  const { errorMessage, isPending, run } = useActionRunner();
  const [hostname, setHostname] = useState(override);
  return (
    <SettingsSection title="Link host name" description={<>Lobby &quot;Open&quot; links use this name. Leave it empty to use the detected Tailscale MagicDNS name{detected ? <> (<span className="text-foreground">{detected}</span>)</> : null}.</>}>
      <form
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          run(() => savePublicHostname(hostname));
        }}
        className="flex max-w-xl gap-3"
      >
        <FormInput value={hostname} onChange={(changeEvent) => setHostname(changeEvent.target.value)} placeholder={detected || "homelab.tail1234.ts.net"} aria-label="Link host name" />
        <Button type="submit" variant="primary" disabled={isPending}>
          Save
        </Button>
      </form>
      <FormErrorMessage message={errorMessage} />
    </SettingsSection>
  );
}

const RETENTION_FIELDS: { key: keyof RetentionSettings; label: string; unit: string }[] = [
  { key: "rawHours", label: "Raw samples", unit: "hours" },
  { key: "minuteRollupDays", label: "1-minute rollups", unit: "days" },
  { key: "hourRollupDays", label: "1-hour rollups", unit: "days" },
  { key: "filesystemDays", label: "Disk usage", unit: "days" },
  { key: "loginDays", label: "Login history", unit: "days" },
  { key: "alertDays", label: "Resolved alerts", unit: "days" },
];

function RetentionSection({ retention }: { retention: RetentionSettings }) {
  const { errorMessage, isPending, run } = useActionRunner();
  const [values, setValues] = useState<Record<keyof RetentionSettings, string>>(Object.fromEntries(Object.entries(retention).map(([key, value]) => [key, String(value)])) as Record<keyof RetentionSettings, string>);
  return (
    <SettingsSection title="Retention" description="How long data is kept. Pruning runs hourly in the collector.">
      <form
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          run(() => saveRetention(values));
        }}
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {RETENTION_FIELDS.map((field) => (
            <FormField key={field.key} label={`${field.label} (${field.unit})`} htmlFor={`retention-${field.key}`}>
              <FormInput id={`retention-${field.key}`} type="number" min={1} value={values[field.key]} onChange={(changeEvent) => setValues((previous) => ({ ...previous, [field.key]: changeEvent.target.value }))} />
            </FormField>
          ))}
        </div>
        <FormErrorMessage message={errorMessage} />
        <Button type="submit" variant="primary" disabled={isPending} className="mt-5">
          Save retention
        </Button>
      </form>
    </SettingsSection>
  );
}

const CHANNEL_DETAILS = {
  ntfy: { label: "ntfy", environment: "NTFY_URL (and optional NTFY_TOKEN)" },
  discord: { label: "Discord", environment: "DISCORD_WEBHOOK_URL" },
  telegram: { label: "Telegram", environment: "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID" },
} as const;

function ChannelsSection({ configuredChannels, lastTestResult }: { configuredChannels: SettingsOverview["configuredChannels"]; lastTestResult: SettingsOverview["lastTestResult"] }) {
  const router = useRouter();
  const { run } = useActionRunner();
  return (
    <SettingsSection title="Notification channels" description="Secrets live only in /etc/serverlab/serverlab.env. The collector sends notifications; tests go through it too.">
      <div className="divide-y divide-dashed divide-line-strong/70">
        {(Object.keys(CHANNEL_DETAILS) as (keyof typeof CHANNEL_DETAILS)[]).map((channel) => (
          <div key={channel} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="w-28 font-medium">{CHANNEL_DETAILS[channel].label}</div>
            <Badge tone={configuredChannels[channel] ? "success" : "slate"}>{configuredChannels[channel] ? "configured" : "not configured"}</Badge>
            <div className="text-xs text-foreground-subtle sm:ml-3">{CHANNEL_DETAILS[channel].environment}</div>
            <Button size="small" variant="outline-secondary" className="sm:ml-auto" disabled={!configuredChannels[channel]} onClick={() => run(() => requestTestNotification(channel), () => window.setTimeout(() => router.refresh(), 5000))} leadingIcon={<Send className="mr-1.5 h-3.5 w-3.5" />}>
              Send test
            </Button>
          </div>
        ))}
      </div>
      {lastTestResult && (
        <div className={`mt-4 text-xs ${lastTestResult.isSuccessful ? "text-success" : "text-danger"}`}>
          Last test ({lastTestResult.channel}, {formatRelativeTime(new Date(lastTestResult.finishedAt).toISOString())}): {lastTestResult.isSuccessful ? "delivered" : `failed: ${lastTestResult.errorMessage}`}
        </div>
      )}
    </SettingsSection>
  );
}

function GpuPowerSection({ gpuPower, lastResult }: { gpuPower: NonNullable<SettingsOverview["gpuPower"]>; lastResult: SettingsOverview["lastGpuPowerResult"] }) {
  const router = useRouter();
  const { errorMessage, isPending, run } = useActionRunner();
  const isSwitchedOff = gpuPower.configuredMode === "off";
  const refreshWhileSwitching = () => [5000, 20_000, 60_000].forEach((delay) => window.setTimeout(() => router.refresh(), delay));
  return (
    <SettingsSection
      title="NVIDIA GPU power"
      description="Off runs the desktop on the Intel GPU and powers the NVIDIA GPU down, which saves several watts on a host that does not need it. Switching runs prime-select through a root unit and applies after a reboot."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Badge tone={gpuPower.isPoweredOn ? "success" : "slate"}>{gpuPower.isPoweredOn ? "on now" : "off now"}</Badge>
        <span className="text-foreground-muted">next boot: {isSwitchedOff ? "off" : gpuPower.configuredMode}</span>
        {gpuPower.isRebootPending && <Badge tone="warning">reboot to apply</Badge>}
        <Button
          size="small"
          variant={isSwitchedOff ? "outline-secondary" : "danger"}
          className="sm:ml-auto"
          disabled={isPending}
          onClick={() => run(() => requestGpuPowerMode(isSwitchedOff ? "on-demand" : "off"), refreshWhileSwitching)}
          leadingIcon={isSwitchedOff ? <Power className="mr-1.5 h-3.5 w-3.5" /> : <PowerOff className="mr-1.5 h-3.5 w-3.5" />}
        >
          {isSwitchedOff ? "Turn on (on-demand)" : "Turn off"}
        </Button>
      </div>
      <FormErrorMessage message={errorMessage} />
      {lastResult && (
        <div className={`mt-4 text-xs ${lastResult.isSuccessful ? "text-success" : "text-danger"}`}>
          Last switch to {lastResult.mode} ({formatRelativeTime(new Date(lastResult.finishedAt).toISOString())}): {lastResult.isSuccessful ? "done, reboot to apply" : `failed: ${lastResult.errorMessage}`}
        </div>
      )}
    </SettingsSection>
  );
}

function describeCapability(value: unknown): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.length === 0 ? "none" : value.map((item) => (typeof item === "object" && item && "name" in item ? `${String((item as { name: string }).name)}${"statsAvailable" in item && !(item as { statsAvailable: boolean }).statsAvailable ? " (no stats)" : ""}` : String(item))).join(", ");
  if (value === null || value === undefined) return "—";
  return String(value);
}

function SystemSection({ overview }: { overview: SettingsOverview }) {
  return (
    <SettingsSection title="System" description="What the collector detected on this host (re-checked every 10 minutes).">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {overview.capabilities.map((capability) => (
          <div key={capability.key} className="flex gap-3 border-b border-dashed border-line-strong/50 pb-2">
            <dt className="w-40 shrink-0 text-foreground-muted">{capability.key}</dt>
            <dd className="min-w-0 break-words">{describeCapability(capability.value)}</dd>
          </div>
        ))}
        <div className="flex gap-3 border-b border-dashed border-line-strong/50 pb-2 sm:col-span-2">
          <dt className="w-40 shrink-0 text-foreground-muted">database</dt>
          <dd className="min-w-0 break-all">
            {overview.databasePath} ({formatBytes(overview.databaseSizeBytes)})
          </dd>
        </div>
        <div className="flex gap-3 border-b border-dashed border-line-strong/50 pb-2 sm:col-span-2">
          <dt className="w-40 shrink-0 text-foreground-muted">GeoIP database</dt>
          <dd className="min-w-0 break-all">{overview.isGeolocationDatabasePresent ? overview.geolocationDatabasePath : "not installed"}</dd>
        </div>
      </dl>
    </SettingsSection>
  );
}

function DangerSection() {
  const { errorMessage, isPending, run } = useActionRunner();
  const [confirmation, setConfirmation] = useState("");
  return (
    <SettingsSection title="Danger zone" description="Login IPs and locations are personal data. Purging deletes every stored login event; new ones keep arriving.">
      <div className="flex max-w-xl gap-3">
        <FormInput value={confirmation} onChange={(changeEvent) => setConfirmation(changeEvent.target.value)} placeholder='Type "PURGE"' aria-label="Confirmation" />
        <Button variant="danger" disabled={isPending || confirmation !== "PURGE"} onClick={() => run(() => purgeLoginHistory(confirmation), () => setConfirmation(""))} leadingIcon={<ShieldAlert className="mr-2 h-4 w-4" />}>
          Purge login history
        </Button>
      </div>
      <FormErrorMessage message={errorMessage} />
    </SettingsSection>
  );
}

/**
 * All Settings sections: password, sessions, link host name, retention, notification channels,
 * NVIDIA GPU power (hybrid-graphics hosts only), detected system capabilities and the
 * login-history purge.
 *
 * @example
 * <SettingsPanels overview={readSettingsOverview(database)} currentIdHash={session.idHash} />
 */
export function SettingsPanels({ overview, currentIdHash }: { overview: SettingsOverview; currentIdHash: string }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
      <PasswordSection />
      <SessionsSection sessions={overview.sessions} currentIdHash={currentIdHash} />
      <HostnameSection override={overview.publicHostnameOverride} detected={overview.detectedHostname} />
      <ChannelsSection configuredChannels={overview.configuredChannels} lastTestResult={overview.lastTestResult} />
      <RetentionSection retention={overview.retention} />
      {overview.gpuPower?.isSupported && <GpuPowerSection gpuPower={overview.gpuPower} lastResult={overview.lastGpuPowerResult} />}
      <SystemSection overview={overview} />
      <DangerSection />
    </div>
  );
}
