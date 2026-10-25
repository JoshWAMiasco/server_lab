import type { Metadata } from "next";
import { LobbyBoard } from "@/components/lobby/lobby-board";
import { CATALOG } from "@/lib/catalog/catalog";
import { getDatabase } from "@/lib/database/client";
import { listCustomIcons } from "@/lib/lobby/custom-icon-store";
import { readLobbyCards, readPublicHostname } from "@/lib/queries/lobby-queries";
import { readRenderTimestamp } from "@/lib/request-time";

export const metadata: Metadata = { title: "Lobby" };
export const dynamic = "force-dynamic";

const GROUPS = ["all", "apps", "services", "websites", "databases"] as const;

const ICON_CHOICES = CATALOG.filter((entry) => entry.icon !== null)
  .map((entry) => ({ iconFileName: entry.icon as string, name: entry.name }))
  .sort((left, right) => left.name.localeCompare(right.name));

export default async function LobbyPage({ searchParams }: PageProps<"/">) {
  const { group, focus } = await searchParams;
  const database = getDatabase();
  const initialGroup = GROUPS.find((candidate) => candidate === group) ?? "all";
  return <LobbyBoard cards={readLobbyCards(database)} hostname={readPublicHostname(database)} referenceTimestamp={readRenderTimestamp()} iconChoices={ICON_CHOICES} customIconChoices={listCustomIcons(database).map((choice) => ({ iconFileName: choice.iconReference, name: choice.name }))} initialGroup={initialGroup} focusKey={typeof focus === "string" ? focus : null} />;
}
