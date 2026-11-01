"use client";

import { BrickWall, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Modal, ModalBody, ModalFooter } from "@/components/interactive/modal";
import { Badge, type BadgeTone } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Card, CardHeader } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { FormField } from "@/components/primitives/form-field";
import { FormInput } from "@/components/primitives/form-input";
import { FormSelect } from "@/components/primitives/form-select";
import { StaticAlert } from "@/components/primitives/static-alert";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/primitives/table";
import { CommandLabel } from "@/components/security/command-label";
import { LearnCommands, type LearnCommand } from "@/components/security/learn-commands";
import { LockoutConfirmation, useSecurityActionRunner } from "@/components/security/security-action-runner";
import { buildActionCommands, buildFirewallRuleArguments, formatCommandLine } from "@/lib/security/security-commands";
import {
  FIREWALL_LOGGING_LEVELS,
  FIREWALL_POLICIES,
  FIREWALL_PROTOCOLS,
  FIREWALL_RULE_ACTIONS,
  FIREWALL_RULE_DIRECTIONS,
  type FirewallLoggingLevel,
  type FirewallPolicy,
  type FirewallPolicyDirection,
  type FirewallRule,
  type FirewallRuleInput,
  type FirewallState,
  type SecurityAction,
} from "@/lib/security/security-types";

type ChangeAction = Exclude<SecurityAction, { kind: "snapshot" }>;

const commandFor = (action: ChangeAction) =>
  buildActionCommands(action)
    .map((command) => formatCommandLine(command))
    .join(" && ");

interface RuleFormValues {
  action: FirewallRuleInput["action"];
  direction: FirewallRuleInput["direction"];
  interfaceName: string;
  fromAddress: string;
  port: string;
  protocol: FirewallRuleInput["protocol"];
  comment: string;
}

const EMPTY_RULE: RuleFormValues = { action: "allow", direction: "in", interfaceName: "", fromAddress: "", port: "", protocol: "tcp", comment: "" };

const RULE_PRESETS: { label: string; values: RuleFormValues; caption: string }[] = [
  { label: "Everything over Tailscale", values: { ...EMPTY_RULE, interfaceName: "tailscale0", protocol: "any", comment: "tailnet" }, caption: "The usual first rule: anything arriving on the Tailscale interface is allowed." },
  { label: "SSH, rate limited", values: { ...EMPTY_RULE, action: "limit", port: "22", comment: "ssh" }, caption: "Allows SSH but blocks an address that opens 6 or more connections in 30 seconds." },
  { label: "SSH from my LAN", values: { ...EMPTY_RULE, fromAddress: "192.168.1.0/24", port: "22", comment: "ssh from lan" }, caption: "A fallback path in when Tailscale is down. Change the network to match yours." },
  { label: "Block an address", values: { ...EMPTY_RULE, action: "deny", fromAddress: "203.0.113.7", protocol: "any", comment: "blocked" }, caption: "Drops everything from one address. New rules go to the end, so allow rules above it still match first." },
];

const toRuleInput = (values: RuleFormValues): FirewallRuleInput => ({
  action: values.action,
  direction: values.direction,
  interfaceName: values.interfaceName.trim() || null,
  fromAddress: values.fromAddress.trim() || null,
  port: values.port.trim() || null,
  protocol: values.protocol,
  comment: values.comment.trim() || null,
});

const actionTone = (action: string): BadgeTone => (action.startsWith("ALLOW") ? "success" : action.startsWith("LIMIT") ? "warning" : "danger");

const LEARN_COMMANDS: readonly LearnCommand[] = [
  { command: "sudo ufw status verbose", caption: "Whether the firewall is on, the default policies and every rule." },
  { command: "sudo ufw status numbered", caption: "Rules with numbers, for deleting by number." },
  { command: "sudo ufw show added", caption: "Saved rules as commands. Works while the firewall is off." },
  { command: "sudo ufw allow 443/tcp", caption: "Short form: allow a port from anywhere." },
  { command: "sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp", caption: "Long form: only from one network, to one port." },
  { command: "sudo ufw delete allow 443/tcp", caption: "Delete a rule by repeating it after delete, instead of using its number." },
  { command: "sudo ufw insert 1 deny from 203.0.113.7", caption: "Put a rule first. UFW uses the first rule that matches." },
  { command: "sudo ufw app list", caption: "Named profiles installed by packages, like OpenSSH or Nginx Full." },
  { command: "sudo ufw reset", caption: "Turn off and delete every rule (backups are kept in /etc/ufw). Use with care." },
];

function StatusPill({ status }: { status: FirewallState["status"] }) {
  const tone: BadgeTone = status === "active" ? "success" : status === "inactive" ? "warning" : "secondary";
  const label = status === "active" ? "Active" : status === "inactive" ? "Off" : status === "not-installed" ? "Not installed" : "Unknown";
  return (
    <Badge tone={tone} variant="soft" data-testid="firewall-status" className="font-display tracking-[0.08em] uppercase">
      {label}
    </Badge>
  );
}

function PolicyControl({ direction, current, canChange, onApply }: { direction: FirewallPolicyDirection; current: string | undefined; canChange: boolean; onApply: (policy: FirewallPolicy) => void }) {
  const [selected, setSelected] = useState<FirewallPolicy>(FIREWALL_POLICIES.includes(current as FirewallPolicy) ? (current as FirewallPolicy) : "deny");
  const command = commandFor({ kind: "firewall-default", direction, policy: selected });
  return (
    <div className="grid gap-2">
      <div className="flex items-end gap-2">
        <FormField label={`${direction[0]?.toUpperCase()}${direction.slice(1)}`} htmlFor={`policy-${direction}`} className="flex-1">
          <FormSelect id={`policy-${direction}`} value={selected} onChange={(changeEvent) => setSelected(changeEvent.target.value as FirewallPolicy)} options={FIREWALL_POLICIES.map((policy) => ({ label: policy, value: policy }))} />
        </FormField>
        <Button variant="outline-primary" disabled={!canChange || selected === current} onClick={() => onApply(selected)}>
          Apply
        </Button>
      </div>
      <div className="text-xs text-foreground-subtle">Now: {current ?? "unknown"}</div>
      <CommandLabel command={command} />
    </div>
  );
}

function RuleForm({ canChange, onSubmit, isPending }: { canChange: boolean; onSubmit: (rule: FirewallRuleInput, onQueued: () => void) => void; isPending: boolean }) {
  const [values, setValues] = useState<RuleFormValues>(EMPTY_RULE);
  const [presetCaption, setPresetCaption] = useState<string | null>(null);
  const update = (key: keyof RuleFormValues) => (changeEvent: { target: { value: string } }) => setValues((previous) => ({ ...previous, [key]: changeEvent.target.value }));
  const ruleInput = toRuleInput(values);
  const preview = formatCommandLine({ program: "ufw", commandArguments: buildFirewallRuleArguments(ruleInput) });
  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    onSubmit(ruleInput, () => {
      setValues(EMPTY_RULE);
      setPresetCaption(null);
    });
  };
  return (
    <form onSubmit={submit} className="mt-4 grid gap-4" aria-label="Add a firewall rule">
      <div className="flex flex-wrap gap-2">
        {RULE_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="small"
            variant="soft-secondary"
            onClick={() => {
              setValues(preset.values);
              setPresetCaption(preset.caption);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      {presetCaption && <p className="text-xs text-foreground-subtle">{presetCaption}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FormField label="Action" htmlFor="rule-action">
          <FormSelect id="rule-action" value={values.action} onChange={update("action")} options={FIREWALL_RULE_ACTIONS.map((action) => ({ label: action, value: action }))} />
        </FormField>
        <FormField label="Direction" htmlFor="rule-direction">
          <FormSelect id="rule-direction" value={values.direction} onChange={update("direction")} options={FIREWALL_RULE_DIRECTIONS.map((direction) => ({ label: direction === "in" ? "in (to this server)" : "out (from this server)", value: direction }))} />
        </FormField>
        <FormField label="Port or range" htmlFor="rule-port" helpText="22, or 6000:6007. Empty: all ports.">
          <FormInput id="rule-port" value={values.port} onChange={update("port")} placeholder="22" inputMode="numeric" />
        </FormField>
        <FormField label="Protocol" htmlFor="rule-protocol">
          <FormSelect id="rule-protocol" value={values.protocol} onChange={update("protocol")} options={FIREWALL_PROTOCOLS.map((protocol) => ({ label: protocol, value: protocol }))} />
        </FormField>
        <FormField label="From" htmlFor="rule-from" helpText="An address or network. Empty: anywhere.">
          <FormInput id="rule-from" value={values.fromAddress} onChange={update("fromAddress")} placeholder="192.168.1.0/24" />
        </FormField>
        <FormField label="Interface" htmlFor="rule-interface" helpText="Optional, like tailscale0 or eth0.">
          <FormInput id="rule-interface" value={values.interfaceName} onChange={update("interfaceName")} placeholder="tailscale0" list="interface-suggestions" />
          <datalist id="interface-suggestions">
            <option value="tailscale0" />
            <option value="eth0" />
            <option value="enp1s0" />
            <option value="wlan0" />
          </datalist>
        </FormField>
        <FormField label="Comment" htmlFor="rule-comment" helpText="Shown in ufw status." className="sm:col-span-2">
          <FormInput id="rule-comment" value={values.comment} onChange={update("comment")} placeholder="why this rule exists" maxLength={64} />
        </FormField>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium tracking-[0.08em] text-foreground-muted uppercase">This runs</div>
        <CommandLabel command={preview} caption="Updates as you type. New rules are added at the end of the list; UFW applies the first rule that matches." />
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={!canChange || isPending} leadingIcon={<Plus className="mr-2 h-4 w-4" />}>
          Add rule
        </Button>
      </div>
    </form>
  );
}

function SectionCard({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={`min-w-0 p-5 ${className ?? ""}`}>
      <CardHeader title={title} description={description} />
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/**
 * The Firewall page: UFW on/off, default policies, logging, the numbered rule list with delete, an
 * add-rule form with a live command preview, and a list of commands to learn. Every control shows
 * the `ufw` command it runs. Changes are disabled when `canChange` is false (no root helper).
 *
 * @example
 * <FirewallBoard firewall={state.firewall} canChange={state.helper === "ready"} />
 */
export function FirewallBoard({ firewall, canChange }: { firewall: FirewallState | null; canChange: boolean }) {
  const runner = useSecurityActionRunner();
  const [ruleToDelete, setRuleToDelete] = useState<FirewallRule | null>(null);

  if (!firewall) {
    return <EmptyState icon={<BrickWall className="h-10 w-10 stroke-[1] text-brand" />} title="No firewall status yet" description="The collector reads UFW within a few seconds of starting. Check that serverlab-collector is running." />;
  }
  if (firewall.status === "not-installed") {
    return (
      <SectionCard title="UFW is not installed" description="UFW (Uncomplicated Firewall) is Ubuntu's standard front end to the kernel firewall. Install it, allow your way in, then turn it on.">
        <div className="grid max-w-3xl gap-3">
          <CommandLabel command="sudo apt install ufw" />
          <CommandLabel command="sudo ufw allow in on tailscale0" caption="Allow everything over Tailscale first, so you keep access." />
          <CommandLabel command="sudo ufw enable" />
        </div>
      </SectionCard>
    );
  }

  const isActive = firewall.status === "active";
  const toggleAction: ChangeAction = isActive ? { kind: "firewall-disable" } : { kind: "firewall-enable" };
  const run = (action: ChangeAction, onQueued?: () => void) => runner.run(action, { onQueued });

  return (
    <div className="grid grid-cols-12 gap-6">
      <SectionCard
        title="Status"
        className="col-span-12 lg:col-span-5"
        description={isActive ? "Incoming traffic is filtered by the rules below." : "UFW is installed but off: nothing is filtered. Add a rule that lets you in (SSH or tailscale0) before turning it on."}
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={firewall.status} />
            <Button data-testid="firewall-toggle" variant={isActive ? "outline-danger" : "primary"} disabled={!canChange || runner.isPending} onClick={() => run(toggleAction)}>
              {isActive ? "Turn off" : "Turn on"}
            </Button>
          </div>
          <CommandLabel command={commandFor(toggleAction)} caption={isActive ? "Stops filtering now and on every boot. Rules are kept." : "ufw enable asks for confirmation over SSH; --force answers yes. Filtering starts now and on every boot."} />
          <div className="grid gap-2">
            <FormField label="Logging" htmlFor="firewall-logging" helpText={`Now: ${firewall.logging ?? "unknown"}. Blocked packets go to /var/log/ufw.log.`}>
              <FormSelect
                id="firewall-logging"
                value={FIREWALL_LOGGING_LEVELS.includes(firewall.logging as FirewallLoggingLevel) ? (firewall.logging as string) : "low"}
                disabled={!canChange}
                onChange={(changeEvent) => run({ kind: "firewall-logging", level: changeEvent.target.value as FirewallLoggingLevel })}
                options={FIREWALL_LOGGING_LEVELS.map((level) => ({ label: level, value: level }))}
              />
            </FormField>
            <CommandLabel command={`sudo ufw logging ${firewall.logging ?? "low"}`} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Default policies" className="col-span-12 lg:col-span-7" description="What happens to traffic that no rule matches. The safe setup is deny incoming, allow outgoing.">
        <div className="grid gap-5 md:grid-cols-3">
          {(["incoming", "outgoing", "routed"] as const).map((direction) => (
            <PolicyControl key={`${direction}-${firewall.defaults?.[direction] ?? "unknown"}`} direction={direction} current={firewall.defaults?.[direction]} canChange={canChange && !runner.isPending} onApply={(policy) => run({ kind: "firewall-default", direction, policy })} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Rules" className="col-span-12" description={isActive ? "UFW checks rules from the top and uses the first match. IPv6 copies have their own numbers." : "UFW lists numbered rules only while it is on. These are the saved rules that apply when you turn it on."}>
        <CommandLabel command={isActive ? "sudo ufw status numbered" : "sudo ufw show added"} className="mb-4 max-w-xl" />
        {isActive ? (
          firewall.rules.length === 0 ? (
            <p className="text-foreground-muted">No rules. With incoming set to deny, nothing can reach this server.</p>
          ) : (
            <div className="relative overflow-x-auto">
              <Table data-testid="firewall-rules" className="min-w-[640px]">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-12">#</TableHeaderCell>
                    <TableHeaderCell>To</TableHeaderCell>
                    <TableHeaderCell>Action</TableHeaderCell>
                    <TableHeaderCell>From</TableHeaderCell>
                    <TableHeaderCell>Comment</TableHeaderCell>
                    <TableHeaderCell className="w-12">
                      <span className="sr-only">Delete</span>
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {firewall.rules.map((rule) => (
                    <TableRow key={`${rule.number}-${rule.ruleText}`}>
                      <TableCell className="text-foreground-subtle tabular-nums">{rule.number}</TableCell>
                      <TableCell className="whitespace-nowrap">{rule.to}</TableCell>
                      <TableCell>
                        <Badge tone={actionTone(rule.action)} variant="soft">
                          {rule.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{rule.from}</TableCell>
                      <TableCell className="text-foreground-muted">{rule.comment}</TableCell>
                      <TableCell>
                        <button type="button" aria-label={`Delete rule ${rule.number}`} disabled={!canChange} onClick={() => setRuleToDelete(rule)} className="cursor-pointer p-1.5 text-foreground-muted transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-40">
                          <Trash2 className="h-4 w-4 stroke-[1.3]" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : firewall.addedRules.length === 0 ? (
          <p className="text-foreground-muted">No saved rules{canChange ? "." : " (or ServerLab cannot read them without the root helper)."}</p>
        ) : (
          <ul className="grid gap-2" data-testid="firewall-added-rules">
            {firewall.addedRules.map((command) => (
              <li key={command}>
                <CommandLabel command={`sudo ${command}`} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Add a rule" className="col-span-12" description="Pick a preset or fill in the fields. The command below is exactly what runs.">
        <RuleForm canChange={canChange} isPending={runner.isPending} onSubmit={(rule, onQueued) => run({ kind: "firewall-add-rule", rule }, onQueued)} />
        {runner.errorMessage && <p className="mt-3 text-sm text-danger">{runner.errorMessage}</p>}
      </SectionCard>

      <div className="col-span-12 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Learn the commands" description="Everything this page does, plus a few things it does not, from a terminal.">
          <LearnCommands commands={LEARN_COMMANDS} />
        </SectionCard>
        <StaticAlert tone="warning" variant="soft" icon={<ShieldAlert className="mr-3 h-5 w-5 flex-none" />} className="self-start">
          <div className="grid gap-2 leading-relaxed">
            <strong className="font-medium">Docker skips UFW for published ports.</strong>
            <span>
              A container started with <code>-p 8080:80</code> is reachable from every network even when UFW denies port 8080, because Docker adds its own iptables rules ahead of UFW&apos;s. Publish on localhost instead (<code>-p 127.0.0.1:8080:80</code>) and expose it through nginx, or use the ufw-docker project.
            </span>
          </div>
        </StaticAlert>
      </div>

      <Modal isOpen={ruleToDelete !== null} onOpenChange={(isOpen) => !isOpen && setRuleToDelete(null)} title={`Delete rule ${ruleToDelete?.number ?? ""}?`}>
        <ModalBody className="grid gap-4">
          <p className="text-foreground">{ruleToDelete?.ruleText}</p>
          {ruleToDelete && <CommandLabel command={commandFor({ kind: "firewall-delete-rule", ruleNumber: ruleToDelete.number, expectedRuleText: ruleToDelete.ruleText })} caption="Numbers shift after a delete. ServerLab checks that rule N is still this rule before deleting." />}
        </ModalBody>
        <ModalFooter className="flex justify-end gap-2">
          <Button variant="outline-secondary" onClick={() => setRuleToDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={runner.isPending}
            onClick={() => {
              if (!ruleToDelete) return;
              run({ kind: "firewall-delete-rule", ruleNumber: ruleToDelete.number, expectedRuleText: ruleToDelete.ruleText });
              setRuleToDelete(null);
            }}
          >
            Delete rule
          </Button>
        </ModalFooter>
      </Modal>
      <LockoutConfirmation runner={runner} />
    </div>
  );
}
