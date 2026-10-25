import type { ServerLabDatabase } from "@/lib/database/client";
import { readSetting } from "@/lib/database/key-value";

export interface RetentionSettings {
  rawHours: number;
  minuteRollupDays: number;
  hourRollupDays: number;
  filesystemDays: number;
  loginDays: number;
  alertDays: number;
}

export const DEFAULT_RETENTION: RetentionSettings = { rawHours: 24, minuteRollupDays: 30, hourRollupDays: 365, filesystemDays: 30, loginDays: 365, alertDays: 90 };

export const RETENTION_SETTING_KEY = "retention";

/**
 * The retention settings, with defaults for anything not set.
 */
export function readRetentionSettings(database: ServerLabDatabase): RetentionSettings {
  return { ...DEFAULT_RETENTION, ...readSetting<Partial<RetentionSettings>>(database, RETENTION_SETTING_KEY, {}) };
}
