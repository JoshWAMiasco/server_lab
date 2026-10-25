import type { Metadata } from "next";
import { PageHeader } from "@/components/primitives/page-header";
import { SettingsPanels } from "@/components/settings/settings-panels";
import { requireSession } from "@/lib/authentication/require-session";
import { getDatabase } from "@/lib/database/client";
import { readSettingsOverview } from "@/lib/queries/settings-queries";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession("/settings");
  return (
    <>
      <PageHeader title="Settings" description="Account, retention, notifications and what the collector found on this host." />
      <SettingsPanels overview={readSettingsOverview(getDatabase())} currentIdHash={session.idHash} />
    </>
  );
}
