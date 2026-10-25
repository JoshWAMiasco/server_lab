import fileSystem from "node:fs/promises";
import { readTextFile } from "@/collector/drivers/linux/run-command";
import { parseMounts } from "@/collector/parsers/parse-mounts";
import type { FilesystemUsage } from "@/collector/types";

/**
 * Usage of every real mounted filesystem (pseudo filesystems excluded), like `df`.
 */
export async function readFilesystemUsage(): Promise<FilesystemUsage[]> {
  const mounts = parseMounts((await readTextFile("/proc/mounts")) ?? "");
  const usages = await Promise.all(
    mounts.map(async (mount) => {
      try {
        const statistics = await fileSystem.statfs(mount.mountPoint);
        const sizeBytes = statistics.blocks * statistics.bsize;
        if (sizeBytes <= 0) return null;
        return { mountPoint: mount.mountPoint, device: mount.device, filesystemType: mount.filesystemType, sizeBytes, usedBytes: (statistics.blocks - statistics.bfree) * statistics.bsize };
      } catch {
        return null;
      }
    }),
  );
  return usages.filter((usage): usage is FilesystemUsage => usage !== null);
}
