"use client";

import { Globe2, KeyRound, ShieldX, Waypoints } from "lucide-react";
import { useState } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Card } from "@/components/primitives/card";
import { StaticAlert } from "@/components/primitives/static-alert";
import { StatisticCard } from "@/components/primitives/statistic-card";
import { ChartPanel } from "@/components/resources/chart-panel";
import { readCountryFlag } from "@/components/watcher/country-flag";
import { LOGIN_COLUMNS, LOGIN_EXPORT_COLUMNS } from "@/components/watcher/login-columns";
import { useLiveStream } from "@/hooks/use-live-stream";
import type { LiveLoginEvent } from "@/lib/queries/live-types";
import type { WatcherOverview } from "@/lib/queries/watcher-queries";
import { formatNumber } from "@/utilities/format-number";

const LOGIN_FILTER_FIELDS = [
  { label: "User", columnIdentifier: "username" },
  { label: "IP", columnIdentifier: "sourceAddress" },
  { label: "Result", columnIdentifier: "result" },
  { label: "Channel", columnIdentifier: "channel" },
  { label: "Network", columnIdentifier: "networkTag" },
  { label: "Location", columnIdentifier: "location" },
];

function formatTimelineLabel(timestamp: number, bucketMilliseconds: number): string {
  const date = new Date(timestamp);
  return bucketMilliseconds < 86_400_000 ? `${date.getHours().toString().padStart(2, "0")}:00` : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/**
 * The User Watcher body: summary tiles, logins over time (stacked success/failure), failed
 * attempts by country, and the login data grid. New logins slide in over the live stream.
 *
 * @example
 * <WatcherBoard overview={readWatcherOverview(database, "7d")} />
 */
export function WatcherBoard({ overview }: { overview: WatcherOverview }) {
  const [events, setEvents] = useState<LiveLoginEvent[]>(overview.events);
  const [liveCounts, setLiveCounts] = useState({ successes: 0, failures: 0 });

  useLiveStream("logins", (loginEvent) => {
    setEvents((previousEvents) => (previousEvents.some((existing) => existing.id === loginEvent.id) ? previousEvents : [loginEvent, ...previousEvents]));
    setLiveCounts((previous) => (loginEvent.result === "success" ? { ...previous, successes: previous.successes + 1 } : { ...previous, failures: previous.failures + 1 }));
  });

  const timelineLabels = overview.timeline.bucketTimestamps.map((timestamp) => formatTimelineLabel(timestamp, overview.timeline.bucketMilliseconds));

  return (
    <>
      {overview.backfill?.state === "running" && (
        <StaticAlert tone="primary" variant="soft" className="mt-6">
          Importing login history from the journal and wtmp… {formatNumber(overview.backfill.count)} events so far. Imported rows are marked &quot;history&quot;.
        </StaticAlert>
      )}
      <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatisticCard label="Logins today" value={formatNumber(overview.successfulToday + liveCounts.successes)} icon={<KeyRound className="absolute top-5 right-5 h-6 w-6 stroke-[1] text-success/80" />} />
        <StatisticCard label="Failed attempts" value={formatNumber(overview.failedInRange + liveCounts.failures)} icon={<ShieldX className="absolute top-5 right-5 h-6 w-6 stroke-[1] text-danger/80" />} />
        <StatisticCard label="Unique IPs" value={formatNumber(overview.uniqueAddresses)} icon={<Waypoints className="absolute top-5 right-5 h-6 w-6 stroke-[1] text-info/80" />} />
        <StatisticCard label="Countries" value={formatNumber(overview.countryCount)} icon={<Globe2 className="absolute top-5 right-5 h-6 w-6 stroke-[1] text-warning/80" />} />
      </div>
      <div className="mt-5 grid grid-cols-12 gap-5">
        <ChartPanel title="Logins over time" subtitle={overview.timeline.bucketMilliseconds < 86_400_000 ? "per hour" : "per day"} className="col-span-12 xl:col-span-7">
          <BarChart
            ariaLabel="Successful and failed logins over time"
            labels={timelineLabels}
            series={[
              { label: "Success", values: overview.timeline.successes, colorName: "success", opacity: 0.8 },
              { label: "Failure", values: overview.timeline.failures, colorName: "danger", opacity: 0.7 },
            ]}
            isStacked
            showsXAxisLabels
            showsYAxisLabels
            showsGridLines
            showsLegend
            valueFormat="compact"
            className="h-[260px]"
          />
        </ChartPanel>
        <ChartPanel title="Failed attempts by country" subtitle="top 10" className="col-span-12 xl:col-span-5">
          {overview.failedByCountry.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-foreground-muted">No failed attempts in this range.</div>
          ) : (
            <BarChart
              ariaLabel="Failed attempts by country"
              labels={overview.failedByCountry.map((country) => `${readCountryFlag(country.countryCode)} ${country.countryName}`)}
              series={[{ label: "Failed", values: overview.failedByCountry.map((country) => country.count), colorName: "danger", opacity: 0.6, borderColor: { colorName: "danger" } }]}
              orientation="horizontal"
              barThickness={14}
              showsXAxisLabels
              showsYAxisLabels
              showsGridLines
              valueFormat="compact"
              className="h-[260px]"
            />
          )}
        </ChartPanel>
      </div>
      <Card className="mt-5">
        <DataGrid columns={LOGIN_COLUMNS} rows={events} filterFields={LOGIN_FILTER_FIELDS} exportColumns={LOGIN_EXPORT_COLUMNS} exportFileName="serverlab-logins" pageSizeOptions={[25, 50, 100]} emptyState="No logins recorded in this range." />
        <div className="flex flex-col gap-1 border-t border-line/60 px-5 py-3 text-xs text-foreground-subtle sm:flex-row">
          {overview.isTruncated && <span>Showing the newest 5,000 rows of this range; narrow the range or export to see more.</span>}
          {overview.hasGeolocation ? (
            <span className="sm:ml-auto">
              <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">IP Geolocation by DB-IP</a> (CC BY 4.0). Lookups are offline.
            </span>
          ) : (
            <span className="sm:ml-auto">No GeoIP database installed, so public IPs have no location. install.sh downloads DB-IP Lite.</span>
          )}
        </div>
      </Card>
    </>
  );
}
