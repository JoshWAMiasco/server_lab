import type { Metadata } from "next";
import { AlertsBoard } from "@/components/alerts/alerts-board";
import { PageHeader } from "@/components/primitives/page-header";
import { getDatabase } from "@/lib/database/client";
import { readAlertRules, readRecentAlertEvents } from "@/lib/queries/alert-queries";
import { readConfiguredChannels } from "@/lib/alerts/configured-channels";
import { readRenderTimestamp } from "@/lib/request-time";

export const metadata: Metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default function AlertsPage() {
  const database = getDatabase();
  return (
    <>
      <PageHeader title="Alerts" description="Threshold and event rules, evaluated by the collector and sent to ntfy, Discord, Telegram or in-app." />
      <AlertsBoard rules={readAlertRules(database)} events={readRecentAlertEvents(database, 2000)} configuredChannels={readConfiguredChannels()} referenceTimestamp={readRenderTimestamp()} />
    </>
  );
}
