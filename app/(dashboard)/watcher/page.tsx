import type { Metadata } from "next";
import { PageHeader } from "@/components/primitives/page-header";
import { RangeSwitcher } from "@/components/resources/range-switcher";
import { WatcherBoard } from "@/components/watcher/watcher-board";
import { getDatabase } from "@/lib/database/client";
import { WATCHER_RANGES, readWatcherOverview, type WatcherRange } from "@/lib/queries/watcher-queries";

export const metadata: Metadata = { title: "User Watcher" };
export const dynamic = "force-dynamic";

export default async function WatcherPage({ searchParams }: PageProps<"/watcher">) {
  const { range: requestedRange } = await searchParams;
  const range: WatcherRange = typeof requestedRange === "string" && requestedRange in WATCHER_RANGES ? (requestedRange as WatcherRange) : "7d";
  return (
    <>
      <PageHeader title="User Watcher" description="SSH, console and ServerLab sign-ins: who, when and from where." actions={<RangeSwitcher currentRange={range} basePath="/watcher" liveOptions={[]} historyOptions={["24h", "7d", "30d", "all"]} />} />
      <WatcherBoard key={range} overview={readWatcherOverview(getDatabase(), range)} />
    </>
  );
}
