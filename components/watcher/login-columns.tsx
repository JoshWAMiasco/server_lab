"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { ExportColumn } from "@/components/data-grid/export-rows";
import { Badge } from "@/components/primitives/badge";
import { readCountryFlag } from "@/components/watcher/country-flag";
import type { LiveLoginEvent } from "@/lib/queries/live-types";

const RESULT_APPEARANCE = { success: { label: "success", tone: "success" }, failure: { label: "failure", tone: "danger" }, invalid_user: { label: "invalid user", tone: "danger" } } as const;
const NETWORK_APPEARANCE = { tailnet: { label: "Tailnet", tone: "info" }, lan: { label: "LAN", tone: "slate" }, public: { label: "Public", tone: "warning" } } as const;

/**
 * "Moscow, Russia", "LAN", "macbook (tailnet)" or "—".
 *
 * @example
 * describeLocation(loginEvent); // "Zurich, Switzerland"
 */
export function describeLocation(loginEvent: LiveLoginEvent): string {
  if (loginEvent.networkTag === "tailnet") return loginEvent.tailnetDevice ?? "Tailnet device";
  if (loginEvent.networkTag === "lan") return "LAN";
  return [loginEvent.cityName, loginEvent.countryName].filter(Boolean).join(", ") || "—";
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Data-grid columns for login events (User Watcher). */
export const LOGIN_COLUMNS: ColumnDef<LiveLoginEvent, unknown>[] = [
  {
    id: "timestamp",
    header: "Time",
    accessorFn: (loginEvent) => loginEvent.timestamp,
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {formatTimestamp(row.original.timestamp)}
        {row.original.isBackfilled && <span className="ml-2 text-[10px] text-foreground-subtle uppercase">history</span>}
      </div>
    ),
  },
  {
    id: "result",
    header: "Result",
    accessorFn: (loginEvent) => loginEvent.result,
    cell: ({ row }) => {
      const appearance = RESULT_APPEARANCE[row.original.result];
      return (
        <Badge tone={appearance.tone} className="pr-2">
          {row.original.result === "success" ? "✔" : "✖"} {appearance.label}
        </Badge>
      );
    },
  },
  { id: "username", header: "User", accessorFn: (loginEvent) => loginEvent.username, cell: ({ row }) => <span className="font-medium">{row.original.username}</span> },
  { id: "channel", header: "Channel", accessorFn: (loginEvent) => loginEvent.channel },
  { id: "method", header: "Method", accessorFn: (loginEvent) => loginEvent.method },
  { id: "sourceAddress", header: "IP", accessorFn: (loginEvent) => loginEvent.sourceAddress ?? "", cell: ({ row }) => <span className="whitespace-nowrap">{row.original.sourceAddress ?? "local"}</span> },
  {
    id: "networkTag",
    header: "Network",
    accessorFn: (loginEvent) => loginEvent.networkTag ?? "",
    cell: ({ row }) => {
      if (!row.original.networkTag) return <span className="text-foreground-subtle">—</span>;
      const appearance = NETWORK_APPEARANCE[row.original.networkTag];
      return (
        <Badge tone={appearance.tone} variant="outline" className="pr-2">
          {appearance.label}
        </Badge>
      );
    },
  },
  {
    id: "location",
    header: "Location",
    accessorFn: (loginEvent) => describeLocation(loginEvent),
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {readCountryFlag(row.original.countryCode)} {describeLocation(row.original)}
      </span>
    ),
  },
];

/** CSV / JSON export columns for login events. */
export const LOGIN_EXPORT_COLUMNS: ExportColumn<LiveLoginEvent>[] = [
  { header: "Time (UTC)", readValue: (loginEvent) => new Date(loginEvent.timestamp).toISOString() },
  { header: "Result", readValue: (loginEvent) => loginEvent.result },
  { header: "User", readValue: (loginEvent) => loginEvent.username },
  { header: "Channel", readValue: (loginEvent) => loginEvent.channel },
  { header: "Method", readValue: (loginEvent) => loginEvent.method },
  { header: "IP", readValue: (loginEvent) => loginEvent.sourceAddress ?? "" },
  { header: "Port", readValue: (loginEvent) => loginEvent.sourcePort ?? "" },
  { header: "Network", readValue: (loginEvent) => loginEvent.networkTag ?? "" },
  { header: "Country", readValue: (loginEvent) => loginEvent.countryName ?? "" },
  { header: "City", readValue: (loginEvent) => loginEvent.cityName ?? "" },
  { header: "Tailnet device", readValue: (loginEvent) => loginEvent.tailnetDevice ?? "" },
  { header: "Imported from history", readValue: (loginEvent) => (loginEvent.isBackfilled ? "yes" : "no") },
];
