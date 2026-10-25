import type { DiscoveredItem } from "@/collector/types";

const GIBIBYTE = 1024 ** 3;
const MEBIBYTE = 1024 ** 2;

export interface MockApplication {
  item: Omit<DiscoveredItem, "startedAt" | "extra"> & { extra?: Record<string, unknown> };
  memoryCenterBytes: number;
  memoryLimitBytes: number | null;
  cpuCenterPercent: number;
  uptimeDays: number;
}

const dockerItem = (name: string, image: string, ports: [number, number][], hostAddress = "127.0.0.1", overrides: Partial<DiscoveredItem> = {}): MockApplication["item"] => ({
  key: `docker:${name}`,
  source: "docker",
  rawName: name,
  image,
  unit: null,
  processName: null,
  description: null,
  ports: ports.map(([hostPort, containerPort]) => ({ hostPort, containerPort, protocol: "tcp", hostAddress })),
  labels: {},
  state: "running",
  health: "healthy",
  bindScope: hostAddress === "127.0.0.1" ? "local" : "exposed",
  ...overrides,
});

const systemdItem = (unit: string, description: string, processName: string, ports: number[], hostAddress = "127.0.0.1"): MockApplication["item"] => ({
  key: `systemd:${unit}`,
  source: "systemd",
  rawName: unit.replace(/\.service$/, ""),
  image: null,
  unit,
  processName,
  description,
  ports: ports.map((hostPort) => ({ hostPort, containerPort: null, protocol: "tcp", hostAddress })),
  labels: {},
  state: "running",
  health: "none",
  bindScope: hostAddress === "127.0.0.1" ? "local" : hostAddress.startsWith("100.") ? "tailnet" : "exposed",
});

/** The fake homelab the mock driver reports: containers, native services and nginx sites. */
export const MOCK_APPLICATIONS: readonly MockApplication[] = [
  { item: dockerItem("jellyfin", "jellyfin/jellyfin:10.10.3", [[18096, 8096]]), memoryCenterBytes: 1.42 * GIBIBYTE, memoryLimitBytes: 4 * GIBIBYTE, cpuCenterPercent: 3, uptimeDays: 3 },
  { item: dockerItem("immich-server", "ghcr.io/immich-app/immich-server:release", [[12283, 2283]]), memoryCenterBytes: 0.9 * GIBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 2, uptimeDays: 12 },
  { item: dockerItem("immich-ml", "ghcr.io/immich-app/immich-machine-learning:release", []), memoryCenterBytes: 2.31 * GIBIBYTE, memoryLimitBytes: 3 * GIBIBYTE, cpuCenterPercent: 12, uptimeDays: 12 },
  { item: dockerItem("postgres", "postgres:16-alpine", [[5432, 5432]]), memoryCenterBytes: 380 * MEBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 1, uptimeDays: 12 },
  { item: dockerItem("redis", "redis:7.4", [[6379, 6379]]), memoryCenterBytes: 48 * MEBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 0.4, uptimeDays: 12 },
  { item: dockerItem("homeassistant", "ghcr.io/home-assistant/home-assistant:stable", [[8123, 8123]], "0.0.0.0", { bindScope: "exposed" }), memoryCenterBytes: 610 * MEBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 2.5, uptimeDays: 6 },
  { item: dockerItem("vaultwarden", "vaultwarden/server:latest", [[18080, 80]]), memoryCenterBytes: 42 * MEBIBYTE, memoryLimitBytes: 256 * MEBIBYTE, cpuCenterPercent: 0.2, uptimeDays: 30 },
  { item: dockerItem("uptime-kuma", "louislam/uptime-kuma:1", [[13001, 3001]], "127.0.0.1", { health: "starting", state: "running" }), memoryCenterBytes: 120 * MEBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 1, uptimeDays: 0 },
  { item: dockerItem("sonarr", "lscr.io/linuxserver/sonarr:latest", [[18989, 8989]], "127.0.0.1", { state: "exited", health: "none" }), memoryCenterBytes: 0, memoryLimitBytes: null, cpuCenterPercent: 0, uptimeDays: 0 },
  { item: dockerItem("my-side-project", "ghcr.io/example/side-project:main", [[3100, 3000]], "0.0.0.0", { labels: { "serverlab.name": "Side Project", "serverlab.description": "My weekend Next.js app." } }), memoryCenterBytes: 210 * MEBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 0.6, uptimeDays: 2 },
  { item: systemdItem("nginx.service", "A high performance web server and a reverse proxy server", "nginx", [443, 8096, 8443], "100.101.12.7"), memoryCenterBytes: 24 * MEBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 0.3, uptimeDays: 12 },
  { item: systemdItem("mariadb.service", "MariaDB 11.4 database server", "mariadbd", [3306]), memoryCenterBytes: 812 * MEBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 1.1, uptimeDays: 30 },
  { item: systemdItem("docker.service", "Docker Application Container Engine", "dockerd", []), memoryCenterBytes: 96 * MEBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 0.8, uptimeDays: 30 },
  { item: systemdItem("tailscaled.service", "Tailscale node agent", "tailscaled", []), memoryCenterBytes: 52 * MEBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 0.2, uptimeDays: 30 },
  { item: systemdItem("ollama.service", "Ollama Service", "ollama", [11434]), memoryCenterBytes: 1.1 * GIBIBYTE, memoryLimitBytes: null, cpuCenterPercent: 4, uptimeDays: 5 },
  {
    item: { key: "port:tcp/8000", source: "port", rawName: "python3 :8000", image: null, unit: null, processName: "python3", description: null, ports: [{ hostPort: 8000, containerPort: null, protocol: "tcp", hostAddress: "0.0.0.0" }], labels: {}, state: "running", health: "none", bindScope: "exposed" },
    memoryCenterBytes: 64 * MEBIBYTE,
    memoryLimitBytes: null,
    cpuCenterPercent: 0.1,
    uptimeDays: 1,
  },
];

/** Fake nginx sites ("websites hosted"). */
export const MOCK_NGINX_SITES: readonly DiscoveredItem[] = [
  { key: "nginx:serverlab:443", source: "nginx", rawName: "serverlab", image: null, unit: null, processName: null, description: null, ports: [{ hostPort: 443, containerPort: null, protocol: "tcp", hostAddress: "100.101.12.7" }], labels: {}, state: "running", health: "none", startedAt: null, bindScope: "tailnet", extra: { serverNames: ["homelab.tail1234.ts.net"], isSsl: true, proxyPassPort: 3000, staticRoot: null, sourceFile: "/etc/nginx/sites-enabled/serverlab.conf", sharesPortWith: 0 } },
  { key: "nginx:jellyfin:8096", source: "nginx", rawName: "jellyfin", image: null, unit: null, processName: null, description: null, ports: [{ hostPort: 8096, containerPort: null, protocol: "tcp", hostAddress: "100.101.12.7" }], labels: {}, state: "running", health: "none", startedAt: null, bindScope: "tailnet", extra: { serverNames: ["homelab.tail1234.ts.net"], isSsl: true, proxyPassPort: 18096, staticRoot: null, sourceFile: "/etc/nginx/sites-enabled/jellyfin.conf", sharesPortWith: 0 } },
  { key: "nginx:docs.homelab:8443", source: "nginx", rawName: "docs.homelab", image: null, unit: null, processName: null, description: null, ports: [{ hostPort: 8443, containerPort: null, protocol: "tcp", hostAddress: "100.101.12.7" }], labels: {}, state: "running", health: "none", startedAt: null, bindScope: "tailnet", extra: { serverNames: ["docs.homelab"], isSsl: true, proxyPassPort: null, staticRoot: "/var/www/docs", sourceFile: "/etc/nginx/sites-enabled/docs.conf", sharesPortWith: 0 } },
];

export const MOCK_USERNAMES = ["root", "admin", "ubuntu", "test", "oracle", "postgres", "git", "user", "pi", "deploy"];

/** Public IPs with the country they geolocate to (only used when no GeoIP database is present). */
export const MOCK_ATTACKER_ADDRESSES = ["185.220.101.34", "45.155.205.233", "103.145.13.92", "218.92.0.112", "61.177.172.140", "194.169.175.36", "92.118.39.62", "179.43.180.106", "5.188.206.14", "80.94.95.115"];

export const MOCK_TAILNET_DEVICES = new Map([
  ["100.101.2.3", "macbook"],
  ["100.88.14.21", "pixel-8"],
  ["100.72.9.40", "work-laptop"],
]);
