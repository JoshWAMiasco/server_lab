"use client";

import { Ban, ShieldBan } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { CopyToClipboardButton } from "@/components/interactive/copy-to-clipboard-button";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Card, CardHeader } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { FormField } from "@/components/primitives/form-field";
import { FormInput } from "@/components/primitives/form-input";
import { FormSelect } from "@/components/primitives/form-select";
import { StatisticCard } from "@/components/primitives/statistic-card";
import { CommandLabel } from "@/components/security/command-label";
import { LearnCommands, type LearnCommand } from "@/components/security/learn-commands";
import { LockoutConfirmation, useSecurityActionRunner } from "@/components/security/security-action-runner";
import { buildActionCommands, formatCommandLine } from "@/lib/security/security-commands";
import type { Fail2banJail, Fail2banState } from "@/lib/security/security-types";

const STARTER_JAIL_CONFIGURATION = `# /etc/fail2ban/jail.local  (your settings; jail.conf is overwritten on upgrades)
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
# Never ban yourself: localhost and the whole Tailscale range.
ignoreip = 127.0.0.1/8 ::1 100.64.0.0/10 fd7a:115c:a1e0::/48

[sshd]
enabled = true
# Ubuntu 24.04 and later log SSH to the journal only.
backend = systemd
`;

const LEARN_COMMANDS: readonly LearnCommand[] = [
  { command: "sudo fail2ban-client status", caption: "Which jails are running." },
  { command: "sudo fail2ban-client status sshd", caption: "Failed attempts, current bans and banned addresses for one jail." },
  { command: "sudo fail2ban-client banned", caption: "Every banned address in every jail (fail2ban 1.0 and later)." },
  { command: "sudo fail2ban-client set sshd unbanip 203.0.113.7", caption: "Lift a ban, for example when you locked yourself out from another network." },
  { command: "sudo fail2ban-client get sshd bantime", caption: "Read a jail setting. Also findtime, maxretry, ignoreip." },
  { command: "sudo fail2ban-client -t", caption: "Check the configuration for mistakes before reloading." },
  { command: "sudo fail2ban-client reload", caption: "Apply changes to jail.local without dropping current bans." },
  { command: "sudo tail -f /var/log/fail2ban.log", caption: "Watch bans and unbans as they happen." },
];

/**
 * A jail duration in seconds as fail2ban configs write it: 600 → "10m", 3600 → "1h", -1 → "forever".
 *
 * @example
 * formatJailDuration(3600); // "1h"
 */
export function formatJailDuration(seconds: number | null): string {
  if (seconds === null) return "–";
  if (seconds < 0) return "forever";
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function SectionCard({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={`min-w-0 p-5 ${className ?? ""}`}>
      <CardHeader title={title} description={description} />
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function SetupGuide({ status }: { status: Fail2banState["status"] }) {
  return (
    <div className="grid grid-cols-12 gap-6">
      <SectionCard
        className="col-span-12 lg:col-span-6"
        title={status === "not-installed" ? "fail2ban is not installed" : "fail2ban is installed but not running"}
        description="fail2ban watches logs for repeated failed logins and bans the source address in the firewall for a while. ServerLab does not install it for you; these are the commands to run."
      >
        <ol className="grid gap-4">
          {status === "not-installed" && (
            <li>
              <CommandLabel command="sudo apt install fail2ban" caption="1. Install it. Ubuntu enables the sshd jail out of the box." />
            </li>
          )}
          <li>
            <CommandLabel command="sudoedit /etc/fail2ban/jail.local" caption={`${status === "not-installed" ? "2" : "1"}. Put your settings in jail.local (starter on the right).`} />
          </li>
          <li>
            <CommandLabel command="sudo fail2ban-client -t" caption="Check the configuration." />
          </li>
          <li>
            <CommandLabel command="sudo systemctl enable --now fail2ban" caption="Start it now and on every boot." />
          </li>
          <li>
            <CommandLabel command="sudo fail2ban-client status sshd" caption="Confirm the sshd jail is running. This page fills in within a minute." />
          </li>
        </ol>
      </SectionCard>
      <SectionCard className="col-span-12 lg:col-span-6" title="Starter jail.local" description="Bans an address for an hour after 5 failed SSH logins in 10 minutes, and never bans your tailnet.">
        <div className="relative">
          <pre className="overflow-x-auto border border-line bg-field p-4 text-xs leading-relaxed text-foreground">{STARTER_JAIL_CONFIGURATION}</pre>
          <div className="absolute top-2 right-2">
            <CopyToClipboardButton appearance="icon-only" textToCopy={STARTER_JAIL_CONFIGURATION} accessibleLabel="Copy jail.local" />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function JailCard({ jail, canChange, onUnban, isPending }: { jail: Fail2banJail; canChange: boolean; onUnban: (address: string) => void; isPending: boolean }) {
  return (
    <Card className="p-5" data-testid={`jail-${jail.name}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-display text-base font-semibold tracking-[0.08em] uppercase">{jail.name}</div>
        <Badge tone={jail.currentlyBanned > 0 ? "danger" : "secondary"} variant="soft">
          {jail.currentlyBanned} banned
        </Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {[
          ["Failed now", jail.currentlyFailed],
          ["Failed total", jail.totalFailed],
          ["Banned total", jail.totalBanned],
          ["Ban after", jail.maximumRetries === null ? "–" : `${jail.maximumRetries} tries / ${formatJailDuration(jail.findTimeSeconds)}`],
          ["Ban length", formatJailDuration(jail.banTimeSeconds)],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-xs text-foreground-subtle">{label}</dt>
            <dd className="text-foreground tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        {jail.bannedAddresses.length === 0 ? (
          <p className="text-foreground-muted">No addresses are banned right now.</p>
        ) : (
          <ul className="grid gap-2">
            {jail.bannedAddresses.map((address) => (
              <li key={address} className="flex flex-wrap items-center gap-3 border border-line bg-surface-subtle px-3 py-2">
                <span className="min-w-0 font-medium break-all text-foreground">{address}</span>
                <code className="hidden min-w-0 flex-1 truncate text-xs text-foreground-subtle md:block">{formatCommandLine(buildActionCommands({ kind: "fail2ban-unban", jail: jail.name, address })[0] ?? { program: "fail2ban-client", commandArguments: [] })}</code>
                <Button size="small" variant="outline-secondary" className="ml-auto" disabled={!canChange || isPending} onClick={() => onUnban(address)}>
                  Unban
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CommandLabel command={`sudo fail2ban-client status ${jail.name}`} className="mt-4" />
    </Card>
  );
}

function BanForm({ jails, canChange, isPending, onBan }: { jails: readonly Fail2banJail[]; canChange: boolean; isPending: boolean; onBan: (jail: string, address: string, onQueued: () => void) => void }) {
  const [jailName, setJailName] = useState(jails[0]?.name ?? "sshd");
  const [address, setAddress] = useState("");
  const command = formatCommandLine(buildActionCommands({ kind: "fail2ban-ban", jail: jailName, address: address.trim() || "ADDRESS" })[0] ?? { program: "fail2ban-client", commandArguments: [] });
  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    onBan(jailName, address.trim(), () => setAddress(""));
  };
  return (
    <form onSubmit={submit} className="grid gap-4" aria-label="Ban an address">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Jail" htmlFor="ban-jail">
          <FormSelect id="ban-jail" value={jailName} onChange={(changeEvent) => setJailName(changeEvent.target.value)} options={jails.map((jail) => ({ label: jail.name, value: jail.name }))} />
        </FormField>
        <FormField label="Address" htmlFor="ban-address" helpText="One IPv4 or IPv6 address.">
          <FormInput id="ban-address" value={address} onChange={(changeEvent) => setAddress(changeEvent.target.value)} placeholder="203.0.113.7" required />
        </FormField>
      </div>
      <CommandLabel command={command} caption="The ban lasts the jail's ban length, like an automatic ban." />
      <div>
        <Button type="submit" variant="primary" disabled={!canChange || isPending || address.trim() === ""} leadingIcon={<Ban className="mr-2 h-4 w-4" />}>
          Ban address
        </Button>
      </div>
    </form>
  );
}

/**
 * The fail2ban page: setup commands when fail2ban is missing or stopped; otherwise totals, one card
 * per jail with its banned addresses (and Unban), a manual ban form and a list of commands to learn.
 *
 * @example
 * <Fail2banBoard fail2ban={state.fail2ban} canChange={state.helper === "ready"} />
 */
export function Fail2banBoard({ fail2ban, canChange }: { fail2ban: Fail2banState | null; canChange: boolean }) {
  const runner = useSecurityActionRunner();
  if (!fail2ban) {
    return <EmptyState icon={<ShieldBan className="h-10 w-10 stroke-[1] text-brand" />} title="No fail2ban status yet" description="The collector reads fail2ban within a few seconds of starting. Check that serverlab-collector is running." />;
  }
  if (fail2ban.status !== "running") return <SetupGuide status={fail2ban.status === "stopped" ? "stopped" : "not-installed"} />;

  const totals = fail2ban.jails.reduce((sum, jail) => ({ banned: sum.banned + jail.currentlyBanned, totalBanned: sum.totalBanned + jail.totalBanned, failed: sum.failed + jail.currentlyFailed }), { banned: 0, totalBanned: 0, failed: 0 });
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatisticCard label="Jails" value={fail2ban.jails.length} />
        <StatisticCard label="Banned now" value={totals.banned} />
        <StatisticCard label="Banned since start" value={totals.totalBanned} />
        <StatisticCard label="Failing now" value={totals.failed} />
      </div>
      <p className="text-sm text-foreground-muted">
        fail2ban {fail2ban.version ?? ""} is running. Failed SSH logins it reacts to are listed in the <Link href="/watcher" className="text-brand underline">User Watcher</Link>.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        {fail2ban.jails.map((jail) => (
          <JailCard key={jail.name} jail={jail} canChange={canChange} isPending={runner.isPending} onUnban={(address) => runner.run({ kind: "fail2ban-unban", jail: jail.name, address })} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Ban an address" description="Ban by hand, for example an address you saw in the User Watcher.">
          {fail2ban.jails.length > 0 ? <BanForm jails={fail2ban.jails} canChange={canChange} isPending={runner.isPending} onBan={(jail, address, onQueued) => runner.run({ kind: "fail2ban-ban", jail, address }, { onQueued })} /> : <p className="text-foreground-muted">No jails are enabled. Enable one in /etc/fail2ban/jail.local.</p>}
          {runner.errorMessage && <p className="mt-3 text-sm text-danger">{runner.errorMessage}</p>}
        </SectionCard>
        <SectionCard title="Learn the commands" description="What this page runs, and the commands for everything else.">
          <LearnCommands commands={LEARN_COMMANDS} />
        </SectionCard>
      </div>
      <LockoutConfirmation runner={runner} />
    </div>
  );
}
