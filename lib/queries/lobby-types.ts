/*
 * The Lobby card model shared by the server queries and client components.
 */

export type LobbyGroup = "apps" | "services" | "websites" | "databases";
export type LobbySource = "docker" | "systemd" | "port" | "nginx" | "manual";
export type LobbyCategory = "app" | "service" | "website" | "database" | "infra" | "monitoring";

export interface LobbyCard {
  key: string;
  lobbyItemId: number | null;
  source: LobbySource;
  group: LobbyGroup;
  category: LobbyCategory;
  name: string;
  description: string;
  iconFileName: string | null;
  detectedIconFileName: string | null;
  url: string | null;
  urlNote: string | null;
  connectionString: string | null;
  state: string;
  health: string;
  statusTone: "success" | "warning" | "danger" | "slate";
  statusLabel: string;
  startedAt: number | null;
  ports: { hostPort: number; containerPort: number | null; protocol: string; hostAddress: string }[];
  bindScope: "local" | "tailnet" | "exposed";
  isHidden: boolean;
  isGone: boolean;
  isSystemService: boolean;
  catalogId: string | null;
  viaNginxName: string | null;
  nginxTargetName: string | null;
  serverNames: string[];
  sharesPortWith: number;
  image: string | null;
  unit: string | null;
  version: string | null;
  healthCheckUrl: string | null;
  overrides: { name: string | null; description: string | null; url: string | null; icon: string | null; category: string | null };
}
