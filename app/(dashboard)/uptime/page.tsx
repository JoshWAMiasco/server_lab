import type { Metadata } from "next";
import { PageHeader } from "@/components/primitives/page-header";
import { RangeSwitcher } from "@/components/resources/range-switcher";
import { UptimeBoard } from "@/components/uptime/uptime-board";
import { getDatabase } from "@/lib/database/client";
import { UPTIME_RANGES, readUptimeSummary, type UptimeRange } from "@/lib/queries/uptime-queries";
import { readRenderTimestamp } from "@/lib/request-time";

export const metadata: Metadata = { title: "Uptime" };
export const dynamic = "force-dynamic";

export default async function UptimePage({ searchParams }: PageProps<"/uptime">) {
  const { range: requestedRange } = await searchParams;
  const range: UptimeRange = typeof requestedRange === "string" && requestedRange in UPTIME_RANGES ? (requestedRange as UptimeRange) : "30d";
  const referenceTimestamp = readRenderTimestamp();
  return (
    <>
      <PageHeader title="Uptime" description="Every boot of this host. A reboot keeps the uptime streak running; a shutdown, crash or power loss resets it." actions={<RangeSwitcher currentRange={range} basePath="/uptime" liveOptions={[]} historyOptions={Object.keys(UPTIME_RANGES)} />} />
      <UptimeBoard key={range} summary={readUptimeSummary(getDatabase(), range, referenceTimestamp)} referenceTimestamp={referenceTimestamp} />
    </>
  );
}
