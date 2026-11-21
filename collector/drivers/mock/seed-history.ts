import type { ServerLabDatabase } from "@/lib/database/client";
import { readMockCoreCount, readMockGpuModels } from "@/collector/drivers/mock/mock-hardware";
import { MOCK_APPLICATIONS } from "@/collector/drivers/mock/mock-fixtures";
import type { BootEndKind } from "@/collector/types";

const MINUTE_MILLISECONDS = 60_000;
const HOUR_MILLISECONDS = 3_600_000;
const GIBIBYTE = 1024 ** 3;
const DAY_MILLISECONDS = 86_400_000;

/*
 * Past boots before the mock's current one, oldest first: when each booted and ended (days before
 * the current boot) and how it ended. The current streak spans the last two reboots.
 */
const MOCK_PAST_BOOTS: readonly { bootedDaysBefore: number; endedDaysBefore: number; endKind: BootEndKind }[] = [
  { bootedDaysBefore: 70, endedDaysBefore: 48.05, endKind: "shutdown" },
  { bootedDaysBefore: 48, endedDaysBefore: 40.002, endKind: "reboot" },
  { bootedDaysBefore: 40, endedDaysBefore: 25.02, endKind: "crash" },
  { bootedDaysBefore: 25, endedDaysBefore: 16.25, endKind: "shutdown" },
  { bootedDaysBefore: 16, endedDaysBefore: 9.003, endKind: "reboot" },
  { bootedDaysBefore: 9, endedDaysBefore: 0.002, endKind: "reboot" },
];

/**
 * Mock only: past boot sessions (reboots, shutdowns and a crash) before `currentBootedAt`, so the
 * Uptime page has a history on a fresh development database.
 */
export function seedMockBootHistory(database: ServerLabDatabase, currentBootedAt: number): void {
  const hasSessions = database.$client.prepare("SELECT 1 FROM boot_sessions LIMIT 1").get();
  if (hasSessions) return;
  const insertStatement = database.$client.prepare("INSERT INTO boot_sessions (host_id, boot_id, booted_at, last_seen_at, ended_at, end_kind, streak_started_at) VALUES (1, ?, ?, ?, ?, ?, ?)");
  let previous: { endKind: BootEndKind; streakStartedAt: number } | null = null;
  MOCK_PAST_BOOTS.forEach((boot, bootIndex) => {
    const bootedAt = Math.round(currentBootedAt - boot.bootedDaysBefore * DAY_MILLISECONDS);
    const endedAt = Math.round(currentBootedAt - boot.endedDaysBefore * DAY_MILLISECONDS);
    const streakStartedAt = previous?.endKind === "reboot" ? previous.streakStartedAt : bootedAt;
    insertStatement.run(`mock-past-boot-${bootIndex}`, bootedAt, endedAt, endedAt, boot.endKind, streakStartedAt);
    previous = { endKind: boot.endKind, streakStartedAt };
  });
}

interface SeriesShape {
  metric: string;
  entity: string;
  base: number;
  dailySwing: number;
  noise: number;
}

/**
 * Mock only: fills 30 days of 1-hour and 24 hours of 1-minute rollups with a daily rhythm, so the
 * 24h / 7d / 30d history charts have something to show on a fresh development database.
 */
export function seedMockHistory(database: ServerLabDatabase, now = Date.now()): void {
  const hasRollups = database.$client.prepare("SELECT 1 FROM metric_rollups LIMIT 1").get();
  if (hasRollups) return;
  const series: SeriesShape[] = [
    { metric: "cpu_pct", entity: "", base: 25, dailySwing: 15, noise: 8 },
    { metric: "mem_pct", entity: "", base: 38, dailySwing: 4, noise: 2 },
    { metric: "mem_used", entity: "", base: 12 * GIBIBYTE, dailySwing: 1.2 * GIBIBYTE, noise: 0.4 * GIBIBYTE },
    { metric: "cpu_temp_c", entity: "", base: 55, dailySwing: 6, noise: 3 },
    { metric: "net_rx_bps", entity: "", base: 4_000_000, dailySwing: 3_000_000, noise: 1_500_000 },
    { metric: "net_tx_bps", entity: "", base: 900_000, dailySwing: 600_000, noise: 300_000 },
    { metric: "disk_read_bps", entity: "", base: 2_000_000, dailySwing: 1_000_000, noise: 800_000 },
    { metric: "disk_write_bps", entity: "", base: 1_200_000, dailySwing: 600_000, noise: 500_000 },
    ...Array.from({ length: readMockCoreCount() }, (_, core) => ({ metric: "cpu_core_pct", entity: String(core), base: 18 + ((core * 7) % 20), dailySwing: 15, noise: 12 })),
    ...readMockGpuModels().flatMap((model, gpuIndex) => [
      { metric: "gpu_util", entity: String(gpuIndex), base: 20 + gpuIndex * 8, dailySwing: 20, noise: 10 },
      { metric: "gpu_temp_c", entity: String(gpuIndex), base: 55 + gpuIndex * 2, dailySwing: 8, noise: 2 },
      ...(model.memoryTotalBytes === null ? [] : [{ metric: "gpu_vram_used", entity: String(gpuIndex), base: model.memoryTotalBytes * 0.35, dailySwing: model.memoryTotalBytes * 0.15, noise: model.memoryTotalBytes * 0.05 }]),
    ]),
    { metric: "disk_used_pct", entity: "/", base: 70, dailySwing: 0.2, noise: 0.1 },
    ...MOCK_APPLICATIONS.filter((application) => application.memoryCenterBytes > 0).flatMap((application) => [
      { metric: "app_mem", entity: application.item.key, base: application.memoryCenterBytes, dailySwing: application.memoryCenterBytes * 0.1, noise: application.memoryCenterBytes * 0.05 },
      { metric: "app_cpu", entity: application.item.key, base: application.cpuCenterPercent, dailySwing: application.cpuCenterPercent * 0.5, noise: application.cpuCenterPercent * 0.3 },
    ]),
  ];
  const insertStatement = database.$client.prepare("INSERT OR IGNORE INTO metric_rollups (host_id, bucket_ts, resolution, metric, entity, avg, max, min) VALUES (1, ?, ?, ?, ?, ?, ?, ?)");
  const valueAt = (shape: SeriesShape, timestamp: number) => {
    const hourOfDay = new Date(timestamp).getHours() + new Date(timestamp).getMinutes() / 60;
    return Math.max(0, shape.base + shape.dailySwing * Math.sin(((hourOfDay - 8) / 24) * 2 * Math.PI) + (Math.random() - 0.5) * shape.noise);
  };
  const insertAll = database.$client.transaction(() => {
    const currentHour = Math.floor(now / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
    for (let bucket = currentHour - 30 * 24 * HOUR_MILLISECONDS; bucket < currentHour; bucket += HOUR_MILLISECONDS) {
      for (const shape of series) {
        const average = valueAt(shape, bucket);
        insertStatement.run(bucket, "1h", shape.metric, shape.entity, average, average + shape.noise, Math.max(0, average - shape.noise));
      }
    }
    const currentMinute = Math.floor(now / MINUTE_MILLISECONDS) * MINUTE_MILLISECONDS;
    for (let bucket = currentMinute - 24 * HOUR_MILLISECONDS; bucket < currentMinute - 5 * MINUTE_MILLISECONDS; bucket += MINUTE_MILLISECONDS) {
      for (const shape of series) {
        const average = valueAt(shape, bucket);
        insertStatement.run(bucket, "1m", shape.metric, shape.entity, average, average + shape.noise / 2, Math.max(0, average - shape.noise / 2));
      }
    }
  });
  insertAll();
}
