import type { BootSessionRow } from "@/lib/queries/uptime-queries";
import { formatDuration } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

const END_KIND_CLASS_NAMES = { reboot: "bg-info", shutdown: "bg-warning", crash: "bg-danger", running: "bg-success" } as const;

/**
 * Reads how a boot ended for colours and labels; the current boot is "running".
 *
 * @example
 * readSessionState(session); // "reboot"
 */
export function readSessionState(session: BootSessionRow): keyof typeof END_KIND_CLASS_NAMES {
  return session.endKind ?? "running";
}

/**
 * A horizontal timeline of the window: each boot is a green "up" segment whose right edge is
 * coloured by how it ended (blue reboot, amber shutdown, red crash). Gaps are time the host was off.
 *
 * @example
 * <UptimeTimeline sessions={summary.sessions} rangeStartedAt={summary.rangeStartedAt} rangeEndedAt={summary.rangeEndedAt} />
 */
export function UptimeTimeline({ sessions, rangeStartedAt, rangeEndedAt }: { sessions: readonly BootSessionRow[]; rangeStartedAt: number; rangeEndedAt: number }) {
  const span = Math.max(1, rangeEndedAt - rangeStartedAt);
  const toPercent = (timestamp: number) => (100 * (Math.min(rangeEndedAt, Math.max(rangeStartedAt, timestamp)) - rangeStartedAt)) / span;
  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return (
    <div>
      <div className="relative h-8 w-full overflow-hidden border border-line bg-surface-strong" role="img" aria-label="Timeline of boots in this window: green is up, gaps are off, the marker at each end shows how the boot ended">
        {sessions.map((session) => {
          const endedAt = session.endedAt ?? (session.endKind === null ? rangeEndedAt : session.lastSeenAt);
          const left = toPercent(session.bootedAt);
          const width = Math.max(0.3, toPercent(endedAt) - left);
          const state = readSessionState(session);
          return (
            <div key={session.id} className="absolute inset-y-0 flex" style={{ left: `${left}%`, width: `${width}%` }} title={`${new Date(session.bootedAt).toLocaleString("en-GB")} · up ${formatDuration((endedAt - session.bootedAt) / 1000)} · ${state}`}>
              <div className="h-full flex-1 bg-success/70" />
              {state !== "running" && <div className={mergeClassNames("h-full w-1 shrink-0", END_KIND_CLASS_NAMES[state])} />}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-foreground-subtle">
        <span>{formatDate(rangeStartedAt)}</span>
        <span>now</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-foreground-muted">
        {(
          [
            ["running", "Up"],
            ["reboot", "Reboot (streak continues)"],
            ["shutdown", "Shutdown (streak resets)"],
            ["crash", "Crash / power loss (streak resets)"],
          ] as const
        ).map(([state, label]) => (
          <span key={state} className="flex items-center gap-1.5">
            <span className={mergeClassNames("h-2.5 w-2.5", state === "running" ? "bg-success/70" : END_KIND_CLASS_NAMES[state])} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
