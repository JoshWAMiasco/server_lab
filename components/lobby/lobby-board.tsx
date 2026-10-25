"use client";

import { AppWindow, ChevronDown, Database, Globe, Plus, RefreshCw, Search, Server, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createManualLobbyItem, deleteManualLobbyItem, requestLobbyRescan, saveLobbyOverride, setLobbyItemHidden, updateManualLobbyItem } from "@/app/actions/lobby-actions";
import { Slideover } from "@/components/interactive/slideover";
import { showToastNotification } from "@/components/interactive/toast-notification";
import { LobbyCard, type LobbyCardActions } from "@/components/lobby/lobby-card";
import { LobbyItemForm, type IconChoice } from "@/components/lobby/lobby-item-form";
import { Button } from "@/components/primitives/button";
import { EmptyState } from "@/components/primitives/empty-state";
import { FormCheckbox, FormSwitch } from "@/components/primitives/form-check";
import { FormInput } from "@/components/primitives/form-input";
import { PageHeader } from "@/components/primitives/page-header";
import { StaticAlert } from "@/components/primitives/static-alert";
import { StatisticCard } from "@/components/primitives/statistic-card";
import type { LobbyCard as LobbyCardModel, LobbyGroup } from "@/lib/queries/lobby-types";
import { mergeClassNames } from "@/utilities/merge-class-names";

type GroupFilter = "all" | LobbyGroup;

const GROUP_FILTERS: { value: GroupFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "apps", label: "Apps" },
  { value: "services", label: "Services" },
  { value: "websites", label: "Websites" },
  { value: "databases", label: "Databases" },
];

const STATISTIC_TILES = [
  { group: "apps", label: "Apps", icon: AppWindow },
  { group: "services", label: "Services", icon: Server },
  { group: "websites", label: "Websites", icon: Globe },
  { group: "databases", label: "Databases", icon: Database },
] as const;

type EditorState = { mode: "closed" } | { mode: "add" } | { mode: "edit"; card: LobbyCardModel };

const CARD_GRID_CLASS_NAMES = "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

/**
 * The Server Lobby: counts per group, filters, the card grid with a separate Databases row,
 * hidden items, and the add/edit slide-over. Filtering is instant and client-side.
 *
 * @example
 * <LobbyBoard cards={cards} hostname="homelab.tail1234.ts.net" referenceTimestamp={Date.now()} iconChoices={icons} customIconChoices={uploads} initialGroup="all" focusKey={null} />
 */
export function LobbyBoard({ cards, hostname, referenceTimestamp, iconChoices, customIconChoices, initialGroup, focusKey }: { cards: readonly LobbyCardModel[]; hostname: string; referenceTimestamp: number; iconChoices: readonly IconChoice[]; customIconChoices: readonly IconChoice[]; initialGroup: GroupFilter; focusKey: string | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [groupFilter, setGroupFilter] = useState<GroupFilter>(initialGroup);
  const [searchText, setSearchText] = useState("");
  const [isDockerShown, setIsDockerShown] = useState(true);
  const [isSystemdShown, setIsSystemdShown] = useState(true);
  const [areSystemServicesShown, setAreSystemServicesShown] = useState(false);
  const [areHiddenItemsShown, setAreHiddenItemsShown] = useState(false);
  const [editorState, setEditorState] = useState<EditorState>({ mode: "closed" });

  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(`item-${focusKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusKey]);

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [router]);

  const visibleCards = cards.filter((card) => !card.isHidden && (areSystemServicesShown || !card.isSystemService));
  const hiddenCards = cards.filter((card) => card.isHidden);
  const exposedCards = visibleCards.filter((card) => card.bindScope === "exposed");
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredCards = visibleCards.filter((card) => {
    if (!isDockerShown && card.source === "docker") return false;
    if (!isSystemdShown && card.source === "systemd") return false;
    if (!normalizedSearch) return true;
    return `${card.name} ${card.description} ${card.image ?? ""} ${card.unit ?? ""} ${card.ports.map((port) => port.hostPort).join(" ")}`.toLowerCase().includes(normalizedSearch);
  });

  const actions: LobbyCardActions = {
    onEdit: (card) => setEditorState({ mode: "edit", card }),
    onToggleHidden: (card) =>
      startTransition(async () => {
        const result = await setLobbyItemHidden(card.key, !card.isHidden);
        showToastNotification({ title: `${card.name}: ${result.successMessage ?? result.errorMessage}` });
        router.refresh();
      }),
    onDelete: (card) => {
      if (!card.lobbyItemId || !window.confirm(`Delete "${card.name}"?`)) return;
      startTransition(async () => {
        await deleteManualLobbyItem(card.lobbyItemId as number);
        router.refresh();
      });
    },
  };

  const rescan = () =>
    startTransition(async () => {
      const result = await requestLobbyRescan();
      showToastNotification({ title: result.successMessage ?? "Rescan requested." });
      window.setTimeout(() => router.refresh(), 4000);
    });

  const closeEditor = () => {
    setEditorState({ mode: "closed" });
    router.refresh();
  };

  const renderGrid = (gridCards: readonly LobbyCardModel[]) => (
    <div className={CARD_GRID_CLASS_NAMES}>
      {gridCards.map((card) => (
        <LobbyCard key={card.key} card={card} referenceTimestamp={referenceTimestamp} actions={actions} isFocused={card.key === focusKey} />
      ))}
    </div>
  );

  const nonDatabaseCards = filteredCards.filter((card) => card.group !== "databases");
  const databaseCards = filteredCards.filter((card) => card.group === "databases");
  const groupCards = groupFilter === "all" ? nonDatabaseCards : filteredCards.filter((card) => card.group === groupFilter);
  const editingCard = editorState.mode === "edit" ? editorState.card : null;

  return (
    <>
      <PageHeader
        title="Lobby"
        description={<>Everything hosted on <span className="text-foreground">{hostname}</span>: containers, services, websites and databases.</>}
        actions={
          <>
            <Button variant="outline-secondary" onClick={rescan} leadingIcon={<RefreshCw className="mr-2 h-4 w-4 stroke-[1.3]" />}>
              Rescan
            </Button>
            <Button variant="primary" onClick={() => setEditorState({ mode: "add" })} leadingIcon={<Plus className="mr-2 h-4 w-4 stroke-[1.3]" />}>
              Add item
            </Button>
          </>
        }
      />

      {exposedCards.length > 0 && (
        <StaticAlert tone="warning" variant="soft" icon={<ShieldAlert className="mr-3 h-6 w-6 shrink-0" />} className="mt-6">
          <span className="font-medium">{exposedCards.length} {exposedCards.length === 1 ? "service is" : "services are"} exposed to the LAN</span>: {exposedCards.map((card) => card.name).join(", ")}. Bind them to 127.0.0.1 and publish them through nginx on the Tailscale IP (see docs/HARDENING.md).
        </StaticAlert>
      )}

      <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-4">
        {STATISTIC_TILES.map((tile) => {
          const TileIcon = tile.icon;
          return (
            <button key={tile.group} type="button" onClick={() => setGroupFilter(tile.group)} className="cursor-pointer text-left">
              <StatisticCard label={tile.label} value={visibleCards.filter((card) => card.group === tile.group).length} icon={<TileIcon className="absolute top-5 right-5 h-6 w-6 stroke-[1] text-brand/70" />} className={mergeClassNames(groupFilter === tile.group && "border-brand/70")} />
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex border border-line bg-surface p-0.5" role="tablist" aria-label="Item group">
          {GROUP_FILTERS.map((filter) => (
            <button key={filter.value} type="button" role="tab" aria-selected={groupFilter === filter.value} onClick={() => setGroupFilter(filter.value)} className={mergeClassNames("cursor-pointer px-3.5 py-1.5 text-foreground-muted transition-colors", groupFilter === filter.value ? "bg-brand text-on-primary" : "hover:text-foreground")}>
              {filter.label}
            </button>
          ))}
        </div>
        <div className="relative xl:ml-3 xl:w-72">
          <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-foreground-subtle" />
          <FormInput value={searchText} onChange={(changeEvent) => setSearchText(changeEvent.target.value)} placeholder="Filter by name, image, port…" className="pl-9" aria-label="Filter items" />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 xl:ml-auto">
          <FormCheckbox id="show-docker" label="Docker" checked={isDockerShown} onChange={(changeEvent) => setIsDockerShown(changeEvent.target.checked)} />
          <FormCheckbox id="show-systemd" label="systemd" checked={isSystemdShown} onChange={(changeEvent) => setIsSystemdShown(changeEvent.target.checked)} />
          <FormSwitch id="show-system-services" label="Show system services" checked={areSystemServicesShown} onChange={(changeEvent) => setAreSystemServicesShown(changeEvent.target.checked)} />
        </div>
      </div>

      <div className="mt-6">
        {groupCards.length > 0 ? (
          renderGrid(groupCards)
        ) : (
          <EmptyState icon={<Server className="h-10 w-10 stroke-[1]" />} title="Nothing here" description={cards.length === 0 ? "The collector has not reported any items yet. Discovery runs every 60 seconds." : "No item matches these filters."} />
        )}
      </div>

      {groupFilter === "all" && databaseCards.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 flex items-center gap-2 text-base font-medium">
            <Database className="h-4 w-4 text-brand" /> Databases
          </h2>
          {renderGrid(databaseCards)}
        </section>
      )}

      {hiddenCards.length > 0 && (
        <section className="mt-10">
          <button type="button" onClick={() => setAreHiddenItemsShown((isShown) => !isShown)} className="flex cursor-pointer items-center gap-2 text-foreground-muted hover:text-foreground">
            <ChevronDown className={mergeClassNames("h-4 w-4 transition-transform", areHiddenItemsShown && "rotate-180")} />
            Hidden items ({hiddenCards.length})
          </button>
          {areHiddenItemsShown && <div className="mt-4">{renderGrid(hiddenCards)}</div>}
        </section>
      )}

      <Slideover isOpen={editorState.mode !== "closed"} onOpenChange={(isOpen) => !isOpen && setEditorState({ mode: "closed" })} title={editingCard ? `Edit ${editingCard.name}` : "Add item"} size="large">
        {editorState.mode === "add" && <LobbyItemForm isManual iconChoices={iconChoices} customIconChoices={customIconChoices} onSubmitValues={createManualLobbyItem} onDone={closeEditor} />}
        {editingCard && (
          <LobbyItemForm
            key={editingCard.key}
            isManual={editingCard.source === "manual"}
            iconChoices={iconChoices}
            customIconChoices={customIconChoices}
            detectedIconFileName={editingCard.detectedIconFileName}
            initialValues={{
              name: editingCard.overrides.name ?? "",
              description: editingCard.overrides.description ?? "",
              url: editingCard.overrides.url ?? "",
              icon: editingCard.overrides.icon ?? "",
              category: editingCard.overrides.category ?? (editingCard.source === "manual" ? "app" : ""),
              healthCheckUrl: editingCard.healthCheckUrl ?? "",
            }}
            placeholders={{ name: editingCard.name, description: editingCard.description, url: editingCard.url ?? undefined }}
            onSubmitValues={(formValues) => (editingCard.source === "manual" && editingCard.lobbyItemId ? updateManualLobbyItem(editingCard.lobbyItemId, formValues) : saveLobbyOverride(editingCard.key, formValues))}
            onDone={closeEditor}
          />
        )}
      </Slideover>
    </>
  );
}
