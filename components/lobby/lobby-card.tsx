"use client";

import { BarChart3, Copy, Eye, EyeOff, ExternalLink, MoreVertical, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { CopyToClipboardButton } from "@/components/interactive/copy-to-clipboard-button";
import { DropdownMenu, DropdownMenuDivider, DropdownMenuItem } from "@/components/interactive/dropdown-menu";
import { Tooltip } from "@/components/interactive/tooltip";
import { CatalogIcon } from "@/components/lobby/catalog-icon";
import { ExposureBadge, SourceBadge } from "@/components/lobby/source-badge";
import { Card } from "@/components/primitives/card";
import type { LobbyCard as LobbyCardModel } from "@/lib/queries/lobby-types";
import { formatDuration } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

const STATUS_DOT_CLASS_NAMES = { success: "bg-success shadow-[0_0_6px] shadow-success/70", warning: "bg-warning animate-pulse", danger: "bg-danger animate-pulse", slate: "bg-foreground-faint" } as const;

export interface LobbyCardActions {
  onEdit: (card: LobbyCardModel) => void;
  onToggleHidden: (card: LobbyCardModel) => void;
  onDelete: (card: LobbyCardModel) => void;
}

/**
 * One Lobby item: icon, name, source and exposure badges, status dot with uptime, short
 * description, ports and the "Open" link (or a connection string for databases).
 *
 * @example
 * <LobbyCard card={card} referenceTimestamp={renderedAt} actions={actions} />
 */
export function LobbyCard({ card, referenceTimestamp, actions, isFocused = false }: { card: LobbyCardModel; referenceTimestamp: number; actions: LobbyCardActions; isFocused?: boolean }) {
  const uptimeLabel = card.startedAt && card.state === "running" ? `up ${formatDuration((referenceTimestamp - card.startedAt) / 1000)}` : card.statusLabel;
  const visiblePorts = [...new Set(card.ports.map((port) => port.hostPort))].slice(0, 4);
  return (
    <Card id={`item-${card.key}`} className={mergeClassNames("relative flex h-full flex-col p-5 transition-colors hover:border-line-strong", isFocused && "ring-2 ring-brand", (card.isHidden || card.isGone) && "opacity-60")}>
      <div className="flex items-start gap-3.5">
        <CatalogIcon iconFileName={card.iconFileName} name={card.name} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate font-display text-base font-medium" title={card.name}>
              {card.name}
            </div>
            {card.version && <span className="text-xs text-foreground-subtle">{card.version}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <SourceBadge source={card.source} />
            <ExposureBadge bindScope={card.bindScope} ports={card.ports} />
            {card.viaNginxName && (
              <Tooltip content={`Served via nginx site "${card.viaNginxName}"`}>
                <span className="text-xs text-success">via nginx</span>
              </Tooltip>
            )}
          </div>
        </div>
        <DropdownMenu triggerClassName="h-6 w-6 justify-center text-foreground-muted hover:text-brand" trigger={<MoreVertical aria-label={`${card.name} actions`} className="h-4 w-4" />} menuClassName="w-48">
          <DropdownMenuItem onSelect={() => actions.onEdit(card)} icon={<Pencil className="mr-2 h-4 w-4 stroke-[1.3]" />}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.onToggleHidden(card)} icon={card.isHidden ? <Eye className="mr-2 h-4 w-4 stroke-[1.3]" /> : <EyeOff className="mr-2 h-4 w-4 stroke-[1.3]" />}>
            {card.isHidden ? "Show" : "Hide"}
          </DropdownMenuItem>
          {card.url && (
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(card.url ?? "")} icon={<Copy className="mr-2 h-4 w-4 stroke-[1.3]" />}>
              Copy URL
            </DropdownMenuItem>
          )}
          {card.source !== "nginx" && card.source !== "manual" && (
            <DropdownMenuItem href={`/apps#${encodeURIComponent(card.key)}`} icon={<BarChart3 className="mr-2 h-4 w-4 stroke-[1.3]" />}>
              View usage
            </DropdownMenuItem>
          )}
          {card.source === "manual" && (
            <>
              <DropdownMenuDivider />
              <DropdownMenuItem tone="danger" onSelect={() => actions.onDelete(card)} icon={<Trash2 className="mr-2 h-4 w-4 stroke-[1.3]" />}>
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenu>
      </div>
      <p className="mt-3.5 line-clamp-2 flex-1 leading-relaxed text-foreground-muted">{card.description}</p>
      {card.serverNames.length > 0 && <div className="mt-2 truncate text-xs text-foreground-subtle">server_name {card.serverNames.join(" ")}</div>}
      <div className="mt-4 flex items-center gap-2 border-t border-dashed border-line-strong/70 pt-3.5">
        <span className={mergeClassNames("h-2 w-2 shrink-0 rounded-full", STATUS_DOT_CLASS_NAMES[card.statusTone])} />
        <span className="text-xs whitespace-nowrap text-foreground-muted">{card.isGone ? "gone (not seen for 24 h)" : uptimeLabel}</span>
        {visiblePorts.length > 0 && <span className="truncate text-xs text-foreground-subtle">{visiblePorts.map((port) => `:${port}`).join(" ")}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {card.urlNote && (
            <Tooltip content={card.urlNote}>
              <TriangleAlert className="h-4 w-4 text-warning" />
            </Tooltip>
          )}
          {card.url ? (
            <a href={card.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 border border-brand/60 px-2.5 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand hover:text-on-primary">
              Open <ExternalLink className="h-3 w-3" />
            </a>
          ) : card.connectionString ? (
            <CopyToClipboardButton appearance="icon-only" textToCopy={card.connectionString} accessibleLabel={`Copy connection string ${card.connectionString}`} />
          ) : null}
        </div>
      </div>
    </Card>
  );
}
