import fileSystem from "node:fs";
import { desc } from "drizzle-orm";
import { ALERT_TEST_RESULT_KEY, type AlertTestResult } from "@/lib/alerts/alert-definitions";
import { readConfiguredChannels } from "@/lib/alerts/configured-channels";
import { resolveDatabasePath, type ServerLabDatabase } from "@/lib/database/client";
import { readCapability, readSetting } from "@/lib/database/key-value";
import { readRetentionSettings, type RetentionSettings } from "@/lib/database/retention";
import { readEnvironment } from "@/lib/environment";
import { GPU_POWER_CAPABILITY_KEY, GPU_POWER_RESULT_KEY, type GpuPowerResult, type GpuPowerState } from "@/lib/hardware/gpu-power";
import { sessions } from "@/lib/schema/authentication";
import { capabilities } from "@/lib/schema/system";
import { PUBLIC_HOSTNAME_SETTING_KEY } from "@/lib/queries/lobby-queries";

export interface SettingsOverview {
  sessions: { idHash: string; createdAt: number; lastSeen: number; expiresAt: number; ipAddress: string | null; userAgent: string | null }[];
  publicHostnameOverride: string;
  detectedHostname: string;
  retention: RetentionSettings;
  configuredChannels: Record<"ntfy" | "discord" | "telegram", boolean>;
  lastTestResult: AlertTestResult | null;
  gpuPower: GpuPowerState | null;
  lastGpuPowerResult: GpuPowerResult | null;
  capabilities: { key: string; value: unknown; updatedAt: number }[];
  databasePath: string;
  databaseSizeBytes: number;
  geolocationDatabasePath: string | null;
  isGeolocationDatabasePresent: boolean;
}

function fileSize(filePath: string): number {
  try {
    return fileSystem.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Everything the Settings page shows.
 */
export function readSettingsOverview(database: ServerLabDatabase): SettingsOverview {
  const databasePath = resolveDatabasePath();
  const geolocationDatabasePath = readEnvironment("GEOIP_DB_PATH") ?? null;
  return {
    sessions: database.select().from(sessions).orderBy(desc(sessions.lastSeen)).all(),
    publicHostnameOverride: readSetting<string>(database, PUBLIC_HOSTNAME_SETTING_KEY, ""),
    detectedHostname: readCapability<string>(database, "publicHostname", ""),
    retention: readRetentionSettings(database),
    configuredChannels: readConfiguredChannels(),
    lastTestResult: readSetting<AlertTestResult | null>(database, ALERT_TEST_RESULT_KEY, null),
    gpuPower: readCapability<GpuPowerState | null>(database, GPU_POWER_CAPABILITY_KEY, null),
    lastGpuPowerResult: readSetting<GpuPowerResult | null>(database, GPU_POWER_RESULT_KEY, null),
    capabilities: database.select().from(capabilities).all().filter((row) => !["publicHostname", "hostname", GPU_POWER_CAPABILITY_KEY].includes(row.key)),
    databasePath,
    databaseSizeBytes: fileSize(databasePath) + fileSize(`${databasePath}-wal`),
    geolocationDatabasePath,
    // eslint-disable-next-line no-inline-comments -- tells Next not to trace this runtime-only path
    isGeolocationDatabasePresent: geolocationDatabasePath !== null && fileSystem.existsSync(/*turbopackIgnore: true*/ geolocationDatabasePath),
  };
}
