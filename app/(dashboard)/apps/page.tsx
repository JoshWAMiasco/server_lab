import type { Metadata } from "next";
import { AppUsageBoard } from "@/components/apps/app-usage-board";
import { PageHeader } from "@/components/primitives/page-header";
import { getDatabase } from "@/lib/database/client";
import { readAppUsageOverview } from "@/lib/queries/app-usage-queries";

export const metadata: Metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

export default function ApplicationsPage() {
  return (
    <>
      <PageHeader title="Applications" description="Memory and CPU per app, ranked. Bars show the share of host memory; sizes match docker stats and systemctl status." />
      <div className="mt-6">
        <AppUsageBoard overview={readAppUsageOverview(getDatabase())} />
      </div>
    </>
  );
}
