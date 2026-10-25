"use client";

import { useEffect, useState } from "react";
import { useLiveStream } from "@/hooks/use-live-stream";
import { COLLECTOR_OFFLINE_AFTER_MILLISECONDS, type LiveStatus } from "@/lib/queries/live-types";
import { formatRelativeTime } from "@/utilities/format-date";
import { mergeClassNames } from "@/utilities/merge-class-names";

const ONLINE_WITHIN_MILLISECONDS = 10_000;

function useLiveCollectorStatus(initialStatus: LiveStatus) {
  const [status, setStatus] = useState(initialStatus);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(initialStatus.serverTimestamp);
  useLiveStream("status", (nextStatus) => {
    setStatus(nextStatus);
    setClockOffset(Date.now() - nextStatus.serverTimestamp);
  });
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(interval);
  }, []);
  const heartbeatAge = status.heartbeatTimestamp === null ? Number.POSITIVE_INFINITY : now - clockOffset - status.heartbeatTimestamp;
  return { status, heartbeatAge };
}

/**
 * The top-bar dot: green while the collector's heartbeat is under 10 s old, yellow up to 30 s,
 * red after that. Shows the monitored host's name beside it.
 *
 * @example
 * <CollectorStatus initialStatus={readLiveStatus(database)} />
 */
export function CollectorStatus({ initialStatus }: { initialStatus: LiveStatus }) {
  const { status, heartbeatAge } = useLiveCollectorStatus(initialStatus);
  const tone = heartbeatAge < ONLINE_WITHIN_MILLISECONDS ? "online" : heartbeatAge < COLLECTOR_OFFLINE_AFTER_MILLISECONDS ? "lagging" : "offline";
  return (
    <div className="mr-3 hidden items-center gap-2 border border-line-strong px-3 py-1.5 font-display text-xs tracking-[0.08em] uppercase sm:flex" title={`Collector ${tone}${status.driver ? ` (${status.driver} driver)` : ""}`}>
      <span className={mergeClassNames("h-2 w-2 rounded-full", tone === "online" && "bg-success shadow-[0_0_8px] shadow-success", tone === "lagging" && "bg-warning", tone === "offline" && "animate-pulse bg-danger")} />
      <span className="max-w-[180px] truncate text-foreground-muted">{status.hostname ?? "no collector"}</span>
    </div>
  );
}

/**
 * A red banner over the page content when the collector has been silent longer than
 * `offlineAfterMilliseconds` (from the "Collector offline" rule; null hides it).
 *
 * @example
 * <CollectorOfflineBanner initialStatus={status} offlineAfterMilliseconds={60_000} />
 */
export function CollectorOfflineBanner({ initialStatus, offlineAfterMilliseconds = COLLECTOR_OFFLINE_AFTER_MILLISECONDS }: { initialStatus: LiveStatus; offlineAfterMilliseconds?: number | null }) {
  const { status, heartbeatAge } = useLiveCollectorStatus(initialStatus);
  if (offlineAfterMilliseconds === null || heartbeatAge < offlineAfterMilliseconds) return null;
  return (
    <div role="alert" className="mb-6 flex items-center gap-3 border border-danger/40 bg-danger/10 px-5 py-3 text-danger">
      <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
      {status.heartbeatTimestamp === null ? (
        <span>The collector has not reported yet. Start it with <code className="font-medium">npm run dev:collector</code> (development) or <code className="font-medium">systemctl start serverlab-collector</code>.</span>
      ) : (
        <span>Collector offline since {new Date(status.heartbeatTimestamp).toLocaleString()} ({formatRelativeTime(new Date(status.heartbeatTimestamp).toISOString())}). Live data is paused.</span>
      )}
    </div>
  );
}
