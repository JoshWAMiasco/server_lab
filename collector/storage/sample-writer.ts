import type { ServerLabDatabase } from "@/lib/database/client";
import { appUsageSamples, cpuCoreSamples, diskIoSamples, filesystemUsage, gpuSamples, metricSamples, networkInterfaceSamples, temperatureSensorSamples } from "@/lib/schema/metrics";
import type { AppUsageReading, FilesystemUsage, SystemSample } from "@/collector/types";

/**
 * Inserts one system sample and its per-core, interface, disk, GPU and sensor rows in one
 * transaction. Returns the new sample id.
 */
export function writeSystemSample(database: ServerLabDatabase, sample: SystemSample): number {
  return database.transaction((transaction) => {
    const sumOf = (values: number[]) => values.reduce((total, value) => total + value, 0);
    const inserted = transaction
      .insert(metricSamples)
      .values({
        timestamp: sample.timestamp,
        cpuPercent: sample.cpuPercent,
        loadOne: sample.loadAverages[0],
        loadFive: sample.loadAverages[1],
        loadFifteen: sample.loadAverages[2],
        memoryUsed: sample.memory.usedBytes,
        memoryTotal: sample.memory.totalBytes,
        memoryCached: sample.memory.cachedBytes,
        swapUsed: sample.memory.swapUsedBytes,
        swapTotal: sample.memory.swapTotalBytes,
        cpuTemperatureCelsius: sample.cpuTemperatureCelsius,
        networkReceivedBytesPerSecond: sumOf(sample.networkInterfaces.filter((networkInterface) => networkInterface.interfaceName !== "tailscale0").map((networkInterface) => networkInterface.receivedBytesPerSecond)),
        networkTransmittedBytesPerSecond: sumOf(sample.networkInterfaces.filter((networkInterface) => networkInterface.interfaceName !== "tailscale0").map((networkInterface) => networkInterface.transmittedBytesPerSecond)),
        diskReadBytesPerSecond: sumOf(sample.disks.map((disk) => disk.readBytesPerSecond)),
        diskWrittenBytesPerSecond: sumOf(sample.disks.map((disk) => disk.writtenBytesPerSecond)),
        uptimeSeconds: Math.round(sample.uptimeSeconds),
      })
      .returning({ id: metricSamples.id })
      .get();
    const sampleId = inserted.id;
    if (sample.corePercents.length > 0) transaction.insert(cpuCoreSamples).values(sample.corePercents.map((percent, core) => ({ sampleId, core, percent }))).run();
    if (sample.networkInterfaces.length > 0) transaction.insert(networkInterfaceSamples).values(sample.networkInterfaces.map((networkInterface) => ({ sampleId, ...networkInterface }))).run();
    if (sample.disks.length > 0) transaction.insert(diskIoSamples).values(sample.disks.map((disk) => ({ sampleId, device: disk.deviceName, readBytesPerSecond: disk.readBytesPerSecond, writtenBytesPerSecond: disk.writtenBytesPerSecond }))).run();
    if (sample.gpus.length > 0) {
      transaction
        .insert(gpuSamples)
        .values(
          sample.gpus.map((gpu) => ({
            sampleId,
            gpuIndex: gpu.gpuIndex,
            vendor: gpu.vendor,
            name: gpu.name,
            utilizationPercent: gpu.utilizationPercent,
            memoryUsed: gpu.memoryUsedBytes,
            memoryTotal: gpu.memoryTotalBytes,
            temperatureCelsius: gpu.temperatureCelsius,
            powerWatts: gpu.powerWatts,
          })),
        )
        .run();
    }
    if (sample.temperatures.length > 0) transaction.insert(temperatureSensorSamples).values(sample.temperatures.map((temperature) => ({ sampleId, label: temperature.label, celsius: temperature.celsius }))).run();
    return sampleId;
  });
}

/**
 * Inserts one filesystem usage row per mount.
 */
export function writeFilesystemUsage(database: ServerLabDatabase, timestamp: number, usages: readonly FilesystemUsage[]): void {
  if (usages.length === 0) return;
  database
    .insert(filesystemUsage)
    .values(usages.map((usage) => ({ timestamp, mountPoint: usage.mountPoint, device: usage.device, filesystemType: usage.filesystemType, usedBytes: Math.round(usage.usedBytes), sizeBytes: Math.round(usage.sizeBytes) })))
    .run();
}

/**
 * Inserts one app usage row per application.
 */
export function writeAppUsage(database: ServerLabDatabase, timestamp: number, readings: readonly AppUsageReading[]): void {
  if (readings.length === 0) return;
  database
    .insert(appUsageSamples)
    .values(readings.map((reading) => ({ timestamp, appKey: reading.appKey, source: reading.source, cpuPercent: reading.cpuPercent, memoryBytes: Math.round(reading.memoryBytes), memoryLimitBytes: reading.memoryLimitBytes === null ? null : Math.round(reading.memoryLimitBytes) })))
    .run();
}
