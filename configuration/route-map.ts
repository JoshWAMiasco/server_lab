export interface RouteMapEntry {
  routePath: string;
  title: string;
  groupName: string;
}

/**
 * Every ServerLab page with its breadcrumb title and group.
 */
export const ROUTE_MAP: readonly RouteMapEntry[] = [
  { routePath: "/", title: "Lobby", groupName: "Monitor" },
  { routePath: "/resources", title: "Resources", groupName: "Monitor" },
  { routePath: "/apps", title: "Applications", groupName: "Monitor" },
  { routePath: "/watcher", title: "User Watcher", groupName: "Monitor" },
  { routePath: "/alerts", title: "Alerts", groupName: "Monitor" },
  { routePath: "/security/firewall", title: "Firewall", groupName: "Security" },
  { routePath: "/security/fail2ban", title: "fail2ban", groupName: "Security" },
  { routePath: "/settings", title: "Settings", groupName: "System" },
];
