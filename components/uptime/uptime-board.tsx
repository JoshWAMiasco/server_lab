"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Activity, Power, RotateCcw, Timer, TriangleAlert, Trophy, Zap } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Badge, type BadgeTone } from "@/components/primitives/badge";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { UptimeTimeline, readSessionState } from "@/components/uptime/uptime-timeline";
import type { BootSessionRow, UptimeSummary } from "@/lib/queries/uptime-queries";
import { formatDuration } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

const STATE_APPEARANCE: Record<ReturnType<typeof readSessionState>, { label: string; tone: BadgeTone }> = {
  running: { label: "running", tone: "success" },
  reboot: { label: "reboot", tone: "info" },
  shutdown: { label: "shutdown", tone: "warning" },
  crash: { label: "crash / power loss", tone: "danger" },
};

interface SessionTableRow extends BootSessionRow {
  durationMilliseconds: number;
  streakNumber: number;
}

const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function SummaryTile({ label, icon, value, detail, className }: { label: string; icon: ReactNode; value: ReactNode; detail?: ReactNode; className?: string }) {
  return (
    <div className={mergeClassNames("box relative flex flex-col border border-dashed border-line-strong/80 p-4", className)}>
      <div className="flex items-center gap-2 text-xs tracking-[0.08em] text-foreground-muted uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-medium">{value}</div>
      {detail && <div className="mt-0.5 truncate text-xs text-foreground-subtle">{detail}</div>}
    </div>
  );
}

function createColumns(): ColumnDef<SessionTableRow, unknown>[] {
  return [
    { id: "bootedAt", header: "Booted", accessorFn: (row) => row.bootedAt, cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.bootedAt)}</span> },
    { id: "endedAt", header: "Ended", accessorFn: (row) => row.endedAt ?? Number.MAX_SAFE_INTEGER, cell: ({ row }) => <span className="whitespace-nowrap text-foreground-muted">{row.original.endedAt === null ? "—" : formatDateTime(row.original.endedAt)}</span> },
    { id: "duration", header: "Up for", accessorFn: (row) => row.durationMilliseconds, cell: ({ row }) => <span className="whitespace-nowrap">{formatDuration(row.original.durationMilliseconds / 1000)}</span> },
    {
      id: "state",
      header: "How it ended",
      accessorFn: (row) => STATE_APPEARANCE[readSessionState(row)].label,
      cell: ({ row }) => {
        const appearance = STATE_APPEARANCE[readSessionState(row.original)];
        return (
          <Badge tone={appearance.tone} className="pr-2 whitespace-nowrap">
            {appearance.label}
          </Badge>
        );
      },
    },
    { id: "streak", header: "Streak", accessorFn: (row) => row.streakStartedAt, cell: ({ row }) => <span className="whitespace-nowrap text-foreground-muted">#{row.original.streakNumber} · since {formatDateTime(row.original.streakStartedAt)}</span> },
  ];
}

/**
 * The Uptime page body: the live uptime streak (reboots keep it running, a shutdown or crash
 * resets it), counts for the window, a boot timeline and a table of every boot.
 *
 * @example
 * <UptimeBoard summary={readUptimeSummary(database, "30d")} referenceTimestamp={readRenderTimestamp()} />
 */
export function UptimeBoard({ summary, referenceTimestamp }: { summary: UptimeSummary; referenceTimestamp: number }) {
  const [now, setNow] = useState(referenceTimestamp);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!summary.current) {
    return <EmptyState className="mt-6" title="No boots recorded yet" description="The collector records each boot when it starts. Uptime history appears here after its first run." />;
  }

  const streakNumbers = new Map([...new Set(summary.sessions.map((session) => session.streakStartedAt))].sort((left, right) => left - right).map((streakStartedAt, streakIndex) => [streakStartedAt, streakIndex + 1]));
  const rows: SessionTableRow[] = summary.sessions.map((session) => ({
    ...session,
    durationMilliseconds: (session.endedAt ?? (session.endKind === null ? now : session.lastSeenAt)) - session.bootedAt,
    streakNumber: streakNumbers.get(session.streakStartedAt) ?? 0,
  }));
  const { current } = summary;
  const streakSeconds = (now - current.streakStartedAt) / 1000;
  const bootSeconds = (now - current.bootedAt) / 1000;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <SummaryTile className="col-span-2 md:col-span-2 xl:col-span-2" label="Uptime" icon={<Timer className="h-3.5 w-3.5" />} value={<span className="text-success">{formatDuration(streakSeconds)}</span>} detail={`since ${formatDateTime(current.streakStartedAt)} · ${current.rebootCount === 0 ? "no reboots" : `${current.rebootCount} reboot${current.rebootCount === 1 ? "" : "s"} kept the streak`}`} />
        <SummaryTile label="Current boot" icon={<Zap className="h-3.5 w-3.5" />} value={formatDuration(bootSeconds)} detail={`kernel up since ${formatDateTime(current.bootedAt)}`} />
        <SummaryTile label="Longest streak" icon={<Trophy className="h-3.5 w-3.5" />} value={formatDuration(Math.max(summary.longestStreakMilliseconds, now - current.streakStartedAt) / 1000)} detail="reboots included" />
        <SummaryTile label="Reboots" icon={<RotateCcw className="h-3.5 w-3.5" />} value={<span className="text-info">{summary.rebootCount}</span>} detail="streak continues" />
        <SummaryTile label="Shutdowns" icon={<Power className="h-3.5 w-3.5" />} value={<span className="text-warning">{summary.shutdownCount}</span>} detail="streak resets" />
        <SummaryTile label="Crashes" icon={<TriangleAlert className="h-3.5 w-3.5" />} value={<span className={summary.crashCount > 0 ? "text-danger" : undefined}>{summary.crashCount}</span>} detail={summary.availabilityPercent === null ? "crash or power loss" : `availability ${summary.availabilityPercent.toFixed(summary.availabilityPercent >= 99.95 ? 0 : 2)}%`} />
      </div>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 font-display text-sm font-medium">
            <Activity className="h-4 w-4 text-foreground-muted" />
            Timeline
          </div>
          <div className="text-xs text-foreground-subtle">{summary.sessions.length} boot{summary.sessions.length === 1 ? "" : "s"} in this window</div>
        </div>
        <UptimeTimeline sessions={summary.sessions} rangeStartedAt={summary.rangeStartedAt} rangeEndedAt={now} />
      </Card>
      <Card>
        <DataGrid
          columns={createColumns()}
          rows={rows}
          filterFields={[{ label: "How it ended", columnIdentifier: "state" }]}
          exportColumns={[
            { header: "Booted (UTC)", readValue: (row) => new Date(row.bootedAt).toISOString() },
            { header: "Ended (UTC)", readValue: (row) => (row.endedAt === null ? "" : new Date(row.endedAt).toISOString()) },
            { header: "Up for (seconds)", readValue: (row) => String(Math.round(row.durationMilliseconds / 1000)) },
            { header: "How it ended", readValue: (row) => STATE_APPEARANCE[readSessionState(row)].label },
            { header: "Streak started (UTC)", readValue: (row) => new Date(row.streakStartedAt).toISOString() },
          ]}
          exportFileName="serverlab-uptime"
          pageSizeOptions={[25, 50, 100]}
          emptyState="No boots in this window."
        />
      </Card>
    </div>
  );
}
