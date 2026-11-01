import { Activity, BarChart3, BrickWall, LayoutGrid, Settings, ShieldBan, ShieldCheck, Siren, type LucideIcon } from "lucide-react";

export interface SideMenuLinkEntry {
  entryKind: "link";
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export interface SideMenuGroupEntry {
  entryKind: "group";
  title: string;
  icon: LucideIcon;
  links: readonly SideMenuLinkEntry[];
}

export interface SideMenuDividerEntry {
  entryKind: "divider";
  title: string;
}

export type SideMenuEntry = SideMenuLinkEntry | SideMenuGroupEntry | SideMenuDividerEntry;

const link = (title: string, href: string, icon: LucideIcon, badge?: string): SideMenuLinkEntry => ({ entryKind: "link", title, href, icon, badge });
const divider = (title: string): SideMenuDividerEntry => ({ entryKind: "divider", title });

/**
 * The ServerLab side menu. The ALERTS link shows the number of firing alerts as a badge.
 * Server-only: icons are components, rendered on the server.
 */
export function buildSideMenuNavigation({ firingAlertCount }: { firingAlertCount: number }): readonly SideMenuEntry[] {
  return [
    divider("Monitor"),
    link("Lobby", "/", LayoutGrid),
    link("Resources", "/resources", Activity),
    link("Applications", "/apps", BarChart3),
    link("User Watcher", "/watcher", ShieldCheck),
    link("Alerts", "/alerts", Siren, firingAlertCount > 0 ? String(firingAlertCount) : undefined),
    divider("Security"),
    link("Firewall", "/security/firewall", BrickWall),
    link("fail2ban", "/security/fail2ban", ShieldBan),
    divider("System"),
    link("Settings", "/settings", Settings),
  ];
}
