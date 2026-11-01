"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { requestSecurityRefresh } from "@/app/actions/security-actions";
import { StaticAlert } from "@/components/primitives/static-alert";
import { Button } from "@/components/primitives/button";
import { CommandLabel } from "@/components/security/command-label";
import type { SecurityState } from "@/lib/security/security-types";
import { formatRelativeTime } from "@/utilities/format-date";

const STALE_AFTER_MILLISECONDS = 30_000;

/**
 * When the status was last read, a refresh button, and a notice when changes are unavailable
 * (no root helper, or development mock data). Opening the page refreshes a stale status once.
 *
 * @example
 * <SecurityStatusBar state={overview.state} referenceTimestamp={renderedAt} />
 */
export function SecurityStatusBar({ state, referenceTimestamp }: { state: SecurityState | null; referenceTimestamp: number }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const hasRequestedRefresh = useRef(false);
  const refresh = () =>
    startTransition(async () => {
      await requestSecurityRefresh();
      for (const delay of [2500, 6000]) window.setTimeout(() => router.refresh(), delay);
    });

  useEffect(() => {
    if (hasRequestedRefresh.current) return;
    hasRequestedRefresh.current = true;
    if (!state || referenceTimestamp - state.checkedAt > STALE_AFTER_MILLISECONDS) refresh();
    /* Only on first view of the page. */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable enough for a one-time call
  }, []);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-foreground-subtle">
        <span>{state ? `Status read ${formatRelativeTime(new Date(state.checkedAt).toISOString(), new Date(referenceTimestamp).toISOString())}` : "Waiting for the collector…"}</span>
        <Button size="small" variant="outline-secondary" onClick={refresh} disabled={isRefreshing} leadingIcon={<RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />}>
          Refresh
        </Button>
      </div>
      {state?.helper === "mock" && (
        <StaticAlert tone="secondary" variant="soft">
          Development data: the mock collector simulates UFW and fail2ban. Nothing on this machine changes.
        </StaticAlert>
      )}
      {(state?.helper === "not-installed" || state?.helper === "failed") && (
        <StaticAlert tone="warning" variant="soft" className="grid gap-3">
          <div>
            {state.helperMessage} Until then this page is read-only and shows only what ServerLab can see without root. You can still run every command shown here yourself.
          </div>
          <CommandLabel command="cd /opt/serverlab && sudo ./deploy/install.sh" />
        </StaticAlert>
      )}
    </div>
  );
}
