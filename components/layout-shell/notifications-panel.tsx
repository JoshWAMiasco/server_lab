"use client";

import { BellRing, CheckCheck, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { acknowledgeAlertEvent, acknowledgeAllAlertEvents } from "@/app/actions/alert-event-actions";
import { Slideover } from "@/components/interactive/slideover";
import { showToastNotification } from "@/components/interactive/toast-notification";
import { useLiveStream } from "@/hooks/use-live-stream";
import type { LiveAlertEvent } from "@/lib/queries/live-types";
import { formatRelativeTime } from "@/utilities/format-date";
import { mergeClassNames } from "@/utilities/merge-class-names";

const MAXIMUM_LISTED_EVENTS = 30;

/**
 * The bell in the top bar: the number of firing alerts and a slide-over of recent alert events
 * with "Acknowledge". New events arrive over the live stream and also pop up as toasts.
 *
 * @example
 * <NotificationsPanel initialEvents={recentAlertEvents} triggerClassName={classNames.actionButton} iconClassName={classNames.actionIcon} />
 */
export function NotificationsPanel({ initialEvents, triggerClassName, iconClassName }: { initialEvents: readonly LiveAlertEvent[]; triggerClassName?: string; iconClassName?: string }) {
  const [events, setEvents] = useState<LiveAlertEvent[]>([...initialEvents]);
  const [, startTransition] = useTransition();

  useLiveStream("alerts", (alertEvent) => {
    setEvents((previousEvents) => {
      const isNew = !previousEvents.some((existing) => existing.id === alertEvent.id);
      if (isNew && alertEvent.state === "firing") {
        showToastNotification({ title: alertEvent.ruleName, description: alertEvent.message, icon: <BellRing className="h-6 w-6 shrink-0 text-danger" />, durationInMilliseconds: 6000 });
      }
      return [alertEvent, ...previousEvents.filter((existing) => existing.id !== alertEvent.id)].sort((left, right) => right.startedAt - left.startedAt).slice(0, MAXIMUM_LISTED_EVENTS);
    });
  });

  const firingCount = events.filter((alertEvent) => alertEvent.state === "firing").length;
  const unacknowledgedCount = events.filter((alertEvent) => !alertEvent.isAcknowledged).length;
  const acknowledge = (alertEventId: number) => {
    setEvents((previousEvents) => previousEvents.map((alertEvent) => (alertEvent.id === alertEventId ? { ...alertEvent, isAcknowledged: true } : alertEvent)));
    startTransition(() => acknowledgeAlertEvent(alertEventId));
  };
  const acknowledgeAll = () => {
    setEvents((previousEvents) => previousEvents.map((alertEvent) => ({ ...alertEvent, isAcknowledged: true })));
    startTransition(() => acknowledgeAllAlertEvents());
  };

  const trigger: ReactNode = (
    <button type="button" aria-label={`Notifications, ${firingCount} firing`} className={mergeClassNames("relative cursor-pointer", triggerClassName)}>
      <BellRing className={iconClassName} />
      {(firingCount > 0 || unacknowledgedCount > 0) && (
        <span className={mergeClassNames("absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium text-on-primary", firingCount > 0 ? "bg-danger" : "bg-warning")}>
          {firingCount > 0 ? firingCount : unacknowledgedCount}
        </span>
      )}
    </button>
  );

  return (
    <Slideover hasOutsideCloseButton title="Alerts" panelClassName="w-72 rounded-l-box sm:w-[460px]" trigger={trigger}>
      <div className="flex items-center gap-3 border-b border-line/60 px-5 py-3 text-xs text-foreground-muted">
        <span>{firingCount} firing · {unacknowledgedCount} unacknowledged</span>
        <button type="button" onClick={acknowledgeAll} className="ml-auto flex cursor-pointer items-center gap-1 hover:text-brand">
          <CheckCheck className="h-4 w-4" /> Acknowledge all
        </button>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        {events.length === 0 && <div className="px-3 py-10 text-center text-foreground-muted">No alerts yet. Rules live on the Alerts page.</div>}
        {events.map((alertEvent) => (
          <div key={alertEvent.id} className={mergeClassNames("flex gap-3 border-l-2 px-3 py-2.5 hover:bg-surface-muted/80", alertEvent.state === "firing" ? "border-danger" : "border-success/60", alertEvent.isAcknowledged && "opacity-60")}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {alertEvent.ruleName}
                <span className={mergeClassNames("text-xs", alertEvent.state === "firing" ? "text-danger" : "text-success")}>{alertEvent.state}</span>
              </div>
              <div className="mt-0.5 text-foreground-muted">{alertEvent.message}</div>
              <div className="mt-1.5 text-xs text-foreground-subtle">{formatRelativeTime(new Date(alertEvent.startedAt).toISOString())}</div>
            </div>
            {!alertEvent.isAcknowledged && (
              <button type="button" onClick={() => acknowledge(alertEvent.id)} aria-label="Acknowledge" title="Acknowledge" className="h-fit cursor-pointer text-foreground-subtle hover:text-success">
                <CircleCheck className="h-5 w-5 stroke-[1.3]" />
              </button>
            )}
          </div>
        ))}
        <Link href="/alerts" className="mt-2 px-3 py-2 text-center text-xs text-foreground-muted hover:text-brand">
          Open alert rules and full history →
        </Link>
      </div>
    </Slideover>
  );
}
