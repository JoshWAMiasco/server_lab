import type { Metadata } from "next";
import { PageHeader } from "@/components/primitives/page-header";
import { Fail2banBoard } from "@/components/security/fail2ban-board";
import { SecurityActivityLog } from "@/components/security/security-activity-log";
import { SecurityStatusBar } from "@/components/security/security-status-bar";
import { getDatabase } from "@/lib/database/client";
import { readSecurityOverview } from "@/lib/queries/security-queries";
import { readRenderTimestamp } from "@/lib/request-time";

export const metadata: Metadata = { title: "fail2ban" };
export const dynamic = "force-dynamic";

export default function Fail2banPage() {
  const overview = readSecurityOverview(getDatabase(), "fail2ban");
  const renderedAt = readRenderTimestamp();
  const canChange = overview.state?.helper === "ready" || overview.state?.helper === "mock";
  return (
    <>
      <PageHeader title="fail2ban" description="Jails, banned addresses and manual bans. Every control shows the fail2ban-client command it runs." />
      <div className="grid grid-cols-1 gap-6">
        <SecurityStatusBar state={overview.state} referenceTimestamp={renderedAt} />
        <Fail2banBoard fail2ban={overview.state?.fail2ban ?? null} canChange={canChange} />
        <SecurityActivityLog entries={overview.activity} referenceTimestamp={renderedAt} />
      </div>
    </>
  );
}
