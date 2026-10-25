import { asc, between, desc, eq, gt, gte } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { cpuCoreSamples, diskIoSamples, gpuSamples, metricSamples, networkInterfaceSamples, temperatureSensorSamples } from "@/lib/schema/metrics";
import { alertEvents } from "@/lib/schema/alerts";
import { collectorHeartbeat } from "@/lib/schema/system";
import type { LiveStatus, LiveSystemSample } from "@/lib/queries/live-types";

type SampleRow = typeof metricSamples.$inferSelect;

function groupBySampleId<RowType extends { sampleId: number }>(rows: RowType[]): Map<number, RowType[]> {
  const grouped = new Map<number, RowType[]>();
  for (const row of rows) {
    const existing = grouped.get(row.sampleId);
    if (existing) existing.push(row);
    else grouped.set(row.sampleId, [row]);
  }
  return grouped;
}

function attachChildren(database: ServerLabDatabase, sampleRows: SampleRow[]): LiveSystemSample[] {
  if (sampleRows.length === 0) return [];
  const sampleIds = sampleRows.map((sampleRow) => sampleRow.id);
  const minimumId = Math.min(...sampleIds);
  const maximumId = Math.max(...sampleIds);
  const cores = groupBySampleId(database.select().from(cpuCoreSamples).where(between(cpuCoreSamples.sampleId, minimumId, maximumId)).orderBy(asc(cpuCoreSamples.core)).all());
  const interfaces = groupBySampleId(database.select().from(networkInterfaceSamples).where(between(networkInterfaceSamples.sampleId, minimumId, maximumId)).all());
  const disks = groupBySampleId(database.select().from(diskIoSamples).where(between(diskIoSamples.sampleId, minimumId, maximumId)).all());
  const gpus = groupBySampleId(database.select().from(gpuSamples).where(between(gpuSamples.sampleId, minimumId, maximumId)).all());
  const temperatures = groupBySampleId(database.select().from(temperatureSensorSamples).where(between(temperatureSensorSamples.sampleId, minimumId, maximumId)).all());
  return sampleRows.map((sampleRow) => ({
    id: sampleRow.id,
    timestamp: sampleRow.timestamp,
    cpuPercent: sampleRow.cpuPercent,
    corePercents: (cores.get(sampleRow.id) ?? []).map((coreRow) => coreRow.percent),
    loadAverages: [sampleRow.loadOne, sampleRow.loadFive, sampleRow.loadFifteen],
    memoryUsed: sampleRow.memoryUsed,
    memoryTotal: sampleRow.memoryTotal,
    memoryCached: sampleRow.memoryCached,
    swapUsed: sampleRow.swapUsed,
    swapTotal: sampleRow.swapTotal,
    cpuTemperatureCelsius: sampleRow.cpuTemperatureCelsius,
    temperatures: (temperatures.get(sampleRow.id) ?? []).map(({ label, celsius }) => ({ label, celsius })),
    networkReceivedBytesPerSecond: sampleRow.networkReceivedBytesPerSecond,
    networkTransmittedBytesPerSecond: sampleRow.networkTransmittedBytesPerSecond,
    networkInterfaces: (interfaces.get(sampleRow.id) ?? []).map(({ interfaceName, receivedBytesPerSecond, transmittedBytesPerSecond }) => ({ interfaceName, receivedBytesPerSecond, transmittedBytesPerSecond })),
    diskReadBytesPerSecond: sampleRow.diskReadBytesPerSecond,
    diskWrittenBytesPerSecond: sampleRow.diskWrittenBytesPerSecond,
    disks: (disks.get(sampleRow.id) ?? []).map(({ device, readBytesPerSecond, writtenBytesPerSecond }) => ({ device, readBytesPerSecond, writtenBytesPerSecond })),
    gpus: (gpus.get(sampleRow.id) ?? []).map((gpuRow) => ({ gpuIndex: gpuRow.gpuIndex, vendor: gpuRow.vendor, name: gpuRow.name, utilizationPercent: gpuRow.utilizationPercent, memoryUsed: gpuRow.memoryUsed, memoryTotal: gpuRow.memoryTotal, temperatureCelsius: gpuRow.temperatureCelsius, powerWatts: gpuRow.powerWatts })),
    uptimeSeconds: sampleRow.uptimeSeconds,
  }));
}

/**
 * Raw samples (with per-core, interface, disk, GPU and sensor rows) newer than `sinceTimestamp`,
 * oldest first. Used for the live chart windows (5 m / 15 m / 1 h).
 */
export function readSystemSamplesSince(database: ServerLabDatabase, sinceTimestamp: number): LiveSystemSample[] {
  const sampleRows = database.select().from(metricSamples).where(gte(metricSamples.timestamp, sinceTimestamp)).orderBy(asc(metricSamples.id)).all();
  return attachChildren(database, sampleRows);
}

/**
 * Samples with an id greater than `afterId`, oldest first (the SSE stream's poll).
 */
export function readSystemSamplesAfterId(database: ServerLabDatabase, afterId: number, limit = 30): LiveSystemSample[] {
  const sampleRows = database.select().from(metricSamples).where(gt(metricSamples.id, afterId)).orderBy(asc(metricSamples.id)).limit(limit).all();
  return attachChildren(database, sampleRows);
}

/**
 * The newest sample, or null before the collector's first tick.
 */
export function readLatestSystemSample(database: ServerLabDatabase): LiveSystemSample | null {
  const sampleRow = database.select().from(metricSamples).orderBy(desc(metricSamples.id)).limit(1).get();
  return sampleRow ? (attachChildren(database, [sampleRow])[0] ?? null) : null;
}

/**
 * The id of the newest sample (0 when there is none).
 */
export function readLatestSampleId(database: ServerLabDatabase): number {
  return database.select({ id: metricSamples.id }).from(metricSamples).orderBy(desc(metricSamples.id)).limit(1).get()?.id ?? 0;
}

/**
 * Collector heartbeat and firing alert count, for the top bar and the offline banner.
 */
export function readLiveStatus(database: ServerLabDatabase): LiveStatus {
  const heartbeat = database.select().from(collectorHeartbeat).where(eq(collectorHeartbeat.id, 1)).get();
  const firingAlertCount = database.select({ id: alertEvents.id }).from(alertEvents).where(eq(alertEvents.state, "firing")).all().length;
  return { heartbeatTimestamp: heartbeat?.timestamp ?? null, serverTimestamp: Date.now(), firingAlertCount, hostname: heartbeat?.hostname ?? null, driver: heartbeat?.driver ?? null };
}
