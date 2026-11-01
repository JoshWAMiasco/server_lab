import type { Metadata } from "next";
import { PageHeader } from "@/components/primitives/page-header";
import { FirewallBoard } from "@/components/security/firewall-board";
import { SecurityActivityLog } from "@/components/security/security-activity-log";
import { SecurityStatusBar } from "@/components/security/security-status-bar";
import { getDatabase } from "@/lib/database/client";
import { readSecurityOverview } from "@/lib/queries/security-queries";
import { readRenderTimestamp } from "@/lib/request-time";

export const metadata: Metadata = { title: "Firewall" };
export const dynamic = "force-dynamic";

export default function FirewallPage() {
  const overview = readSecurityOverview(getDatabase(), "firewall");
  const renderedAt = readRenderTimestamp();
  const canChange = overview.state?.helper === "ready" || overview.state?.helper === "mock";
  return (
    <>
      <PageHeader title="Firewall" description="UFW rules and policies. Every control shows the ufw command it runs, so you can do the same from a terminal." />
      <div className="grid grid-cols-1 gap-6">
        <SecurityStatusBar state={overview.state} referenceTimestamp={renderedAt} />
        <FirewallBoard firewall={overview.state?.firewall ?? null} canChange={canChange} />
        <SecurityActivityLog entries={overview.activity} referenceTimestamp={renderedAt} />
      </div>
    </>
  );
}
