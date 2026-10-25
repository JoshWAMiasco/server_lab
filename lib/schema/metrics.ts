import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const hostIdentifier = () => integer("host_id").notNull().default(1);

/** One reading of host metrics, taken every sample interval (2 s by default) and kept 24 h. */
export const metricSamples = sqliteTable(
  "metric_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hostId: hostIdentifier(),
    timestamp: integer("ts").notNull(),
    cpuPercent: real("cpu_pct").notNull(),
    loadOne: real("load1").notNull(),
    loadFive: real("load5").notNull(),
    loadFifteen: real("load15").notNull(),
    memoryUsed: integer("mem_used").notNull(),
    memoryTotal: integer("mem_total").notNull(),
    memoryCached: integer("mem_cached").notNull().default(0),
    swapUsed: integer("swap_used").notNull(),
    swapTotal: integer("swap_total").notNull(),
    cpuTemperatureCelsius: real("cpu_temp_c"),
    networkReceivedBytesPerSecond: real("net_rx_bps").notNull(),
    networkTransmittedBytesPerSecond: real("net_tx_bps").notNull(),
    diskReadBytesPerSecond: real("disk_read_bps").notNull(),
    diskWrittenBytesPerSecond: real("disk_write_bps").notNull(),
    uptimeSeconds: integer("uptime_s").notNull(),
  },
  (table) => [index("metric_samples_ts").on(table.timestamp)],
);

/** Per-core CPU usage for one sample. */
export const cpuCoreSamples = sqliteTable(
  "cpu_core_samples",
  {
    sampleId: integer("sample_id").notNull().references(() => metricSamples.id, { onDelete: "cascade" }),
    core: integer("core").notNull(),
    percent: real("pct").notNull(),
  },
  (table) => [index("cpu_core_samples_sample").on(table.sampleId)],
);

/** Per-interface network throughput for one sample. */
export const networkInterfaceSamples = sqliteTable(
  "net_iface_samples",
  {
    sampleId: integer("sample_id").notNull().references(() => metricSamples.id, { onDelete: "cascade" }),
    interfaceName: text("iface").notNull(),
    receivedBytesPerSecond: real("rx_bps").notNull(),
    transmittedBytesPerSecond: real("tx_bps").notNull(),
  },
  (table) => [index("net_iface_samples_sample").on(table.sampleId)],
);

/** Per-device disk throughput for one sample. */
export const diskIoSamples = sqliteTable(
  "disk_io_samples",
  {
    sampleId: integer("sample_id").notNull().references(() => metricSamples.id, { onDelete: "cascade" }),
    device: text("device").notNull(),
    readBytesPerSecond: real("read_bps").notNull(),
    writtenBytesPerSecond: real("write_bps").notNull(),
  },
  (table) => [index("disk_io_samples_sample").on(table.sampleId)],
);

/** Per-GPU readings for one sample. */
export const gpuSamples = sqliteTable(
  "gpu_samples",
  {
    sampleId: integer("sample_id").notNull().references(() => metricSamples.id, { onDelete: "cascade" }),
    gpuIndex: integer("gpu_index").notNull(),
    vendor: text("vendor").notNull(),
    name: text("name").notNull(),
    utilizationPercent: real("util_pct"),
    memoryUsed: integer("vram_used"),
    memoryTotal: integer("vram_total"),
    temperatureCelsius: real("temp_c"),
    powerWatts: real("power_w"),
  },
  (table) => [index("gpu_samples_sample").on(table.sampleId)],
);

/** Other temperature sensors (NVMe, chipset, ACPI) for one sample. */
export const temperatureSensorSamples = sqliteTable(
  "temp_sensors",
  {
    sampleId: integer("sample_id").notNull().references(() => metricSamples.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    celsius: real("temp_c").notNull(),
  },
  (table) => [index("temp_sensors_sample").on(table.sampleId)],
);

/** Filesystem usage per mount, every 60 s, kept 30 d. */
export const filesystemUsage = sqliteTable(
  "fs_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hostId: hostIdentifier(),
    timestamp: integer("ts").notNull(),
    mountPoint: text("mount").notNull(),
    device: text("device").notNull(),
    filesystemType: text("fstype").notNull(),
    usedBytes: integer("used").notNull(),
    sizeBytes: integer("size").notNull(),
  },
  (table) => [index("fs_usage_ts").on(table.timestamp)],
);

/** Aggregated metrics: `1m` buckets kept 30 d, `1h` buckets kept 365 d. */
export const metricRollups = sqliteTable(
  "metric_rollups",
  {
    hostId: hostIdentifier(),
    bucketTimestamp: integer("bucket_ts").notNull(),
    resolution: text("resolution", { enum: ["1m", "1h"] }).notNull(),
    metric: text("metric").notNull(),
    entity: text("entity").notNull().default(""),
    average: real("avg").notNull(),
    maximum: real("max").notNull(),
    minimum: real("min").notNull(),
  },
  (table) => [uniqueIndex("metric_rollups_unique").on(table.hostId, table.resolution, table.metric, table.entity, table.bucketTimestamp)],
);

/** Application usage, every 10 s, kept 24 h (rolled up as `app_mem` / `app_cpu`). */
export const appUsageSamples = sqliteTable(
  "app_usage_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hostId: hostIdentifier(),
    timestamp: integer("ts").notNull(),
    appKey: text("app_key").notNull(),
    source: text("source", { enum: ["docker", "systemd", "port"] }).notNull(),
    cpuPercent: real("cpu_pct").notNull(),
    memoryBytes: integer("mem_bytes").notNull(),
    memoryLimitBytes: integer("mem_limit"),
  },
  (table) => [index("app_usage_samples_ts").on(table.timestamp), index("app_usage_samples_key_ts").on(table.appKey, table.timestamp)],
);
