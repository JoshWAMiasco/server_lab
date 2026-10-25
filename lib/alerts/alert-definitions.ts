import type { AlertChannel } from "@/lib/schema/alerts";

export const THRESHOLD_METRICS = {
  cpu_pct: { label: "CPU usage", unit: "%" },
  mem_pct: { label: "Memory usage", unit: "%" },
  swap_pct: { label: "Swap usage", unit: "%" },
  load1: { label: "Load average (1 min)", unit: "" },
  cpu_temp_c: { label: "CPU temperature", unit: "°C" },
  gpu_temp_c: { label: "GPU temperature", unit: "°C" },
  gpu_util: { label: "GPU usage", unit: "%" },
  disk_used_pct: { label: "Disk used", unit: "%" },
  app_mem: { label: "App memory", unit: "bytes" },
  app_cpu: { label: "App CPU", unit: "%" },
} as const;

export type ThresholdMetric = keyof typeof THRESHOLD_METRICS;

export const EVENT_KINDS = {
  login_failed_burst: "Failed logins from one IP",
  login_new_country: "Login from a new country",
  item_down: "Lobby item went down",
  item_exposed: "Listener exposed to LAN",
  tls_cert_expiring: "TLS certificate expiring",
  collector_offline: "Collector offline",
} as const;

export type EventKind = keyof typeof EVENT_KINDS;

export const ALERT_CHANNELS: readonly AlertChannel[] = ["inapp", "ntfy", "discord", "telegram"];

export interface DefaultAlertRule {
  seedKey: string;
  name: string;
  kind: "threshold" | "event";
  metric?: ThresholdMetric;
  operator?: ">" | "<";
  threshold?: number;
  forSeconds?: number;
  event?: EventKind;
  parameters?: Record<string, number | string>;
  cooldownSeconds: number;
  channels: AlertChannel[];
}

const EXTERNAL_CHANNELS: AlertChannel[] = ["inapp", "ntfy", "discord", "telegram"];

/** The rules seeded on first start (plan 10). Users can edit or disable them. */
export const DEFAULT_ALERT_RULES: readonly DefaultAlertRule[] = [
  { seedKey: "high-cpu", name: "High CPU", kind: "threshold", metric: "cpu_pct", operator: ">", threshold: 90, forSeconds: 300, cooldownSeconds: 1800, channels: EXTERNAL_CHANNELS },
  { seedKey: "high-memory", name: "High memory", kind: "threshold", metric: "mem_pct", operator: ">", threshold: 95, forSeconds: 120, cooldownSeconds: 1800, channels: EXTERNAL_CHANNELS },
  { seedKey: "cpu-hot", name: "CPU hot", kind: "threshold", metric: "cpu_temp_c", operator: ">", threshold: 85, forSeconds: 60, cooldownSeconds: 1800, channels: EXTERNAL_CHANNELS },
  { seedKey: "gpu-hot", name: "GPU hot", kind: "threshold", metric: "gpu_temp_c", operator: ">", threshold: 85, forSeconds: 60, cooldownSeconds: 1800, channels: EXTERNAL_CHANNELS },
  { seedKey: "disk-full", name: "Disk almost full", kind: "threshold", metric: "disk_used_pct", operator: ">", threshold: 90, forSeconds: 0, cooldownSeconds: 21_600, channels: EXTERNAL_CHANNELS },
  { seedKey: "ssh-brute-force", name: "SSH brute force", kind: "event", event: "login_failed_burst", parameters: { count: 5, windowSeconds: 600 }, cooldownSeconds: 3600, channels: EXTERNAL_CHANNELS },
  { seedKey: "new-country", name: "New country login", kind: "event", event: "login_new_country", cooldownSeconds: 0, channels: EXTERNAL_CHANNELS },
  { seedKey: "service-down", name: "Service down", kind: "event", event: "item_down", cooldownSeconds: 600, channels: EXTERNAL_CHANNELS },
  { seedKey: "service-exposed", name: "Service exposed", kind: "event", event: "item_exposed", parameters: { allowedPorts: "22" }, cooldownSeconds: 86_400, channels: EXTERNAL_CHANNELS },
  { seedKey: "tls-expiring", name: "TLS cert expiring", kind: "event", event: "tls_cert_expiring", parameters: { days: 14 }, cooldownSeconds: 86_400, channels: EXTERNAL_CHANNELS },
  { seedKey: "collector-offline", name: "Collector offline", kind: "event", event: "collector_offline", parameters: { seconds: 60 }, cooldownSeconds: 0, channels: ["inapp"] },
];

export const ALERT_TEST_REQUEST_KEY = "alerts.testRequest";
export const ALERT_TEST_RESULT_KEY = "alerts.testResult";

export interface AlertTestRequest {
  requestId: string;
  channel: Exclude<AlertChannel, "inapp">;
  requestedAt: number;
}

export interface AlertTestResult {
  requestId: string;
  channel: Exclude<AlertChannel, "inapp">;
  isSuccessful: boolean;
  errorMessage: string | null;
  finishedAt: number;
}
