/** Shared by the specs and scripts/end-to-end-server.mjs (which reads E2E_SETUP_TOKEN with the same default). */
export const SETUP_TOKEN = process.env.E2E_SETUP_TOKEN ?? "e2e-setup-token";
export const ADMIN_PASSWORD = "e2e correct horse battery staple";
export const AUTHENTICATION_STATE_PATH = "e2e/.auth/admin.json";

/** Every dashboard page with text that proves it rendered. */
export const DASHBOARD_PAGES = [
  { path: "/", heading: "Lobby" },
  { path: "/resources", heading: "Resources" },
  { path: "/apps", heading: "Applications" },
  { path: "/watcher", heading: "User Watcher" },
  { path: "/alerts", heading: "Alerts" },
  { path: "/security/firewall", heading: "Firewall" },
  { path: "/security/fail2ban", heading: "fail2ban" },
  { path: "/settings", heading: "Settings" },
] as const;
