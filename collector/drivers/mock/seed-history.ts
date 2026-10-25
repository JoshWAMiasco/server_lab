import type { ServerLabDatabase } from "@/lib/database/client";
import { MOCK_APPLICATIONS } from "@/collector/drivers/mock/mock-fixtures";

const MINUTE_MILLISECONDS = 60_000;
const HOUR_MILLISECONDS = 3_600_000;
const GIBIBYTE = 1024 ** 3;

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
    { metric: "gpu_util", entity: "0", base: 30, dailySwing: 25, noise: 10 },
    { metric: "gpu_temp_c", entity: "0", base: 60, dailySwing: 8, noise: 2 },
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
