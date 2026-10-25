"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CircleCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acknowledgeAlertEvent } from "@/app/actions/alert-event-actions";
import { deleteAlertRule, setAlertRuleEnabled } from "@/app/actions/alert-rule-actions";
import { RuleForm } from "@/components/alerts/rule-form";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Slideover } from "@/components/interactive/slideover";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "@/components/interactive/tabs";
import { showToastNotification } from "@/components/interactive/toast-notification";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { FormSwitch } from "@/components/primitives/form-check";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/primitives/table";
import { useLiveStream } from "@/hooks/use-live-stream";
import { EVENT_KINDS, THRESHOLD_METRICS, type ThresholdMetric } from "@/lib/alerts/alert-definitions";
import type { AlertRuleRecord } from "@/lib/queries/alert-queries";
import type { LiveAlertEvent } from "@/lib/queries/live-types";
import { formatBytes, formatDuration } from "@/utilities/format-number";

function describeCondition(rule: AlertRuleRecord): string {
  if (rule.kind === "event") {
    const label = EVENT_KINDS[rule.event as keyof typeof EVENT_KINDS] ?? rule.event ?? "event";
    const parameterText = Object.entries(rule.parameters).map(([key, value]) => `${key} ${value}`).join(", ");
    return parameterText ? `${label} (${parameterText})` : label;
  }
  const definition = THRESHOLD_METRICS[rule.metric as ThresholdMetric];
  const formattedThreshold = definition?.unit === "bytes" ? formatBytes(rule.threshold ?? 0) : `${rule.threshold}${definition?.unit ?? ""}`;
  return `${definition?.label ?? rule.metric}${rule.entity ? ` [${rule.entity}]` : ""} ${rule.operator} ${formattedThreshold}${rule.forSeconds > 0 ? ` for ${formatDuration(rule.forSeconds)}` : ""}`;
}

function createHistoryColumns(onAcknowledge: (alertEventId: number) => void, now: number): ColumnDef<LiveAlertEvent, unknown>[] {
  return [
    { id: "startedAt", header: "Started", accessorFn: (alertEvent) => alertEvent.startedAt, cell: ({ row }) => <span className="whitespace-nowrap">{new Date(row.original.startedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span> },
    { id: "state", header: "State", accessorFn: (alertEvent) => alertEvent.state, cell: ({ row }) => <Badge tone={row.original.state === "firing" ? "danger" : "success"} className="pr-2">{row.original.state}</Badge> },
    { id: "ruleName", header: "Rule", accessorFn: (alertEvent) => alertEvent.ruleName, cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.ruleName}</span> },
    { id: "message", header: "Message", accessorFn: (alertEvent) => alertEvent.message, cell: ({ row }) => <span className="block max-w-[34rem] text-foreground-muted">{row.original.message}</span> },
    { id: "duration", header: "Duration", accessorFn: (alertEvent) => (alertEvent.resolvedAt ?? now) - alertEvent.startedAt, cell: ({ row }) => <span className="whitespace-nowrap">{formatDuration(((row.original.resolvedAt ?? now) - row.original.startedAt) / 1000)}</span> },
    {
      id: "acknowledged",
      header: "Ack",
      accessorFn: (alertEvent) => (alertEvent.isAcknowledged ? "yes" : "no"),
      cell: ({ row }) =>
        row.original.isAcknowledged ? (
          <span className="text-foreground-subtle">yes</span>
        ) : (
          <button type="button" onClick={() => onAcknowledge(row.original.id)} className="flex cursor-pointer items-center gap-1 text-foreground-muted hover:text-success">
            <CircleCheck className="h-4 w-4" /> ack
          </button>
        ),
    },
  ];
}

/**
 * The Alerts page: a Rules tab (enable toggles, edit slide-over, add/delete) and a History tab
 * (every firing and resolution, acknowledgeable). New events arrive over the live stream.
 *
 * @example
 * <AlertsBoard rules={rules} events={events} configuredChannels={channels} referenceTimestamp={Date.now()} />
 */
export function AlertsBoard({ rules, events: initialEvents, configuredChannels, referenceTimestamp }: { rules: readonly AlertRuleRecord[]; events: readonly LiveAlertEvent[]; configuredChannels: Record<"ntfy" | "discord" | "telegram", boolean>; referenceTimestamp: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [events, setEvents] = useState<LiveAlertEvent[]>([...initialEvents]);
  const [editedRule, setEditedRule] = useState<AlertRuleRecord | null | "new">(null);

  useLiveStream("alerts", (alertEvent) => setEvents((previous) => [alertEvent, ...previous.filter((existing) => existing.id !== alertEvent.id)].sort((left, right) => right.startedAt - left.startedAt)));

  const acknowledge = (alertEventId: number) => {
    setEvents((previous) => previous.map((alertEvent) => (alertEvent.id === alertEventId ? { ...alertEvent, isAcknowledged: true } : alertEvent)));
    startTransition(() => acknowledgeAlertEvent(alertEventId));
  };
  const toggleRule = (rule: AlertRuleRecord, isEnabled: boolean) =>
    startTransition(async () => {
      await setAlertRuleEnabled(rule.id, isEnabled);
      router.refresh();
    });
  const removeRule = (rule: AlertRuleRecord) => {
    if (!window.confirm(`Delete the rule "${rule.name}"? Its past events stay in the history.`)) return;
    startTransition(async () => {
      const result = await deleteAlertRule(rule.id);
      showToastNotification({ title: result.successMessage ?? "Deleted." });
      router.refresh();
    });
  };
  const firingCount = events.filter((alertEvent) => alertEvent.state === "firing").length;

  return (
    <Tabs variant="boxed" className="mt-6">
      <div className="flex items-end">
        <TabList className="w-auto">
          <Tab className="px-5">Rules ({rules.length})</Tab>
          <Tab className="px-5">History {firingCount > 0 && <span className="ml-1 text-danger">· {firingCount} firing</span>}</Tab>
        </TabList>
        <Button variant="primary" className="mb-2 ml-auto" onClick={() => setEditedRule("new")} leadingIcon={<Plus className="mr-2 h-4 w-4" />}>
          Add rule
        </Button>
      </div>
      <TabPanels className="mt-5">
        <TabPanel>
          <Card className="overflow-x-auto">
            <Table appearance="list" isHoverable>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="w-20">On</TableHeaderCell>
                  <TableHeaderCell>Rule</TableHeaderCell>
                  <TableHeaderCell>Condition</TableHeaderCell>
                  <TableHeaderCell>Channels</TableHeaderCell>
                  <TableHeaderCell>Cooldown</TableHeaderCell>
                  <TableHeaderCell className="w-24" />
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} className={rule.isEnabled ? undefined : "opacity-60"}>
                    <TableCell>
                      <FormSwitch id={`rule-enabled-${rule.id}`} aria-label={`Enable ${rule.name}`} checked={rule.isEnabled} onChange={(changeEvent) => toggleRule(rule, changeEvent.target.checked)} />
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{rule.name}</TableCell>
                    <TableCell className="text-foreground-muted">{describeCondition(rule)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {rule.channels.map((channel) => (
                          <Badge key={channel} tone={channel === "inapp" || configuredChannels[channel] ? "info" : "slate"} variant="outline" className="pr-2">
                            {channel}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{rule.cooldownSeconds > 0 ? formatDuration(rule.cooldownSeconds) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-3">
                        <button type="button" aria-label={`Edit ${rule.name}`} onClick={() => setEditedRule(rule)} className="cursor-pointer text-foreground-muted hover:text-brand">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" aria-label={`Delete ${rule.name}`} onClick={() => removeRule(rule)} className="cursor-pointer text-foreground-muted hover:text-danger">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabPanel>
        <TabPanel>
          <Card>
            <DataGrid columns={createHistoryColumns(acknowledge, referenceTimestamp)} rows={events} filterFields={[{ label: "Rule", columnIdentifier: "ruleName" }, { label: "State", columnIdentifier: "state" }, { label: "Message", columnIdentifier: "message" }]} exportColumns={[{ header: "Started (UTC)", readValue: (alertEvent) => new Date(alertEvent.startedAt).toISOString() }, { header: "State", readValue: (alertEvent) => alertEvent.state }, { header: "Rule", readValue: (alertEvent) => alertEvent.ruleName }, { header: "Message", readValue: (alertEvent) => alertEvent.message }, { header: "Resolved (UTC)", readValue: (alertEvent) => (alertEvent.resolvedAt ? new Date(alertEvent.resolvedAt).toISOString() : "") }]} exportFileName="serverlab-alerts" pageSizeOptions={[25, 50, 100]} emptyState="No alerts have fired yet." />
          </Card>
        </TabPanel>
      </TabPanels>
      <Slideover isOpen={editedRule !== null} onOpenChange={(isOpen) => !isOpen && setEditedRule(null)} title={editedRule === "new" ? "New rule" : editedRule ? `Edit ${editedRule.name}` : ""} size="large">
        {editedRule !== null && (
          <RuleForm
            key={editedRule === "new" ? "new" : editedRule.id}
            rule={editedRule === "new" ? null : editedRule}
            configuredChannels={configuredChannels}
            onDone={() => {
              setEditedRule(null);
              router.refresh();
            }}
          />
        )}
      </Slideover>
    </Tabs>
  );
}
