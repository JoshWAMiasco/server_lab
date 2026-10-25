/*
 * Shapes sent to the browser, both in the first server render and over the SSE stream. This file
 * has no server imports, so client components can import it.
 */

export interface LiveSystemSample {
  id: number;
  timestamp: number;
  cpuPercent: number;
  corePercents: number[];
  loadAverages: [number, number, number];
  memoryUsed: number;
  memoryTotal: number;
  memoryCached: number;
  swapUsed: number;
  swapTotal: number;
  cpuTemperatureCelsius: number | null;
  temperatures: { label: string; celsius: number }[];
  networkReceivedBytesPerSecond: number;
  networkTransmittedBytesPerSecond: number;
  networkInterfaces: { interfaceName: string; receivedBytesPerSecond: number; transmittedBytesPerSecond: number }[];
  diskReadBytesPerSecond: number;
  diskWrittenBytesPerSecond: number;
  disks: { device: string; readBytesPerSecond: number; writtenBytesPerSecond: number }[];
  gpus: {
    gpuIndex: number;
    vendor: string;
    name: string;
    utilizationPercent: number | null;
    memoryUsed: number | null;
    memoryTotal: number | null;
    temperatureCelsius: number | null;
    powerWatts: number | null;
  }[];
  uptimeSeconds: number;
}

export interface LiveAppUsage {
  appKey: string;
  source: "docker" | "systemd" | "port";
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number | null;
}

export interface LiveAppUsageBatch {
  timestamp: number;
  usages: LiveAppUsage[];
}

export interface LiveLoginEvent {
  id: number;
  timestamp: number;
  channel: "ssh" | "web" | "console";
  username: string;
  result: "success" | "failure" | "invalid_user";
  method: string;
  sourceAddress: string | null;
  sourcePort: number | null;
  countryName: string | null;
  countryCode: string | null;
  cityName: string | null;
  networkTag: "public" | "lan" | "tailnet" | null;
  isBackfilled: boolean;
  tailnetDevice: string | null;
}

export interface LiveAlertEvent {
  id: number;
  ruleId: number | null;
  ruleName: string;
  entity: string;
  state: "firing" | "resolved";
  value: number | null;
  message: string;
  startedAt: number;
  resolvedAt: number | null;
  isAcknowledged: boolean;
}

export interface LiveStatus {
  heartbeatTimestamp: number | null;
  serverTimestamp: number;
  firingAlertCount: number;
  hostname: string | null;
  driver: string | null;
}

export interface LiveTopicPayloads {
  system: LiveSystemSample;
  apps: LiveAppUsageBatch;
  logins: LiveLoginEvent;
  alerts: LiveAlertEvent;
  status: LiveStatus;
}

export type LiveTopic = keyof LiveTopicPayloads;

export const COLLECTOR_OFFLINE_AFTER_MILLISECONDS = 30_000;
