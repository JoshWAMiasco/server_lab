import { ApplicationShell } from "@/components/layout-shell/application-shell";
import { requireSession } from "@/lib/authentication/require-session";
import { getDatabase } from "@/lib/database/client";
import { readCollectorOfflineThreshold, readRecentAlertEvents } from "@/lib/queries/alert-queries";
import { readLobbyCards } from "@/lib/queries/lobby-queries";
import { readLiveStatus } from "@/lib/queries/system-queries";

export const dynamic = "force-dynamic";

const GROUP_TITLES = { apps: "Applications", services: "Services", websites: "Websites", databases: "Databases" } as const;

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  await requireSession();
  const database = getDatabase();
  const visibleCards = readLobbyCards(database).filter((card) => !card.isHidden && !card.isSystemService);
  const searchResultGroups = (Object.keys(GROUP_TITLES) as (keyof typeof GROUP_TITLES)[]).map((group) => ({
    groupTitle: GROUP_TITLES[group],
    seeAllHref: `/?group=${group}`,
    items: visibleCards.filter((card) => card.group === group).map((card) => ({ title: card.name, subtitle: card.description, href: `/?focus=${encodeURIComponent(card.key)}` })),
  }));
  return (
    <ApplicationShell liveStatus={readLiveStatus(database)} alertEvents={readRecentAlertEvents(database)} searchResultGroups={searchResultGroups} offlineAfterMilliseconds={readCollectorOfflineThreshold(database)}>
      {children}
    </ApplicationShell>
  );
}
