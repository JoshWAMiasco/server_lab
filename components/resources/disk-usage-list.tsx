import { HardDrive } from "lucide-react";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { ChartPanel } from "@/components/resources/chart-panel";
import { readUsageTone } from "@/components/resources/metric-tones";
import type { FilesystemUsageRecord } from "@/lib/queries/history-queries";
import { formatBytes } from "@/utilities/format-number";

const PROGRESS_TONES = { success: "success", warning: "warning", danger: "danger", slate: "dark" } as const;

/**
 * Used space per mounted filesystem, as progress bars (refreshed every 60 s by the collector).
 *
 * @example
 * <DiskUsageList filesystems={readLatestFilesystems(database)} />
 */
export function DiskUsageList({ filesystems }: { filesystems: readonly FilesystemUsageRecord[] }) {
  return (
    <ChartPanel title="Disk usage" subtitle="per mount">
      {filesystems.length === 0 && <div className="py-6 text-center text-foreground-muted">No filesystem data yet.</div>}
      <div className="grid grid-cols-1 gap-x-10 gap-y-5 lg:grid-cols-2">
        {filesystems.map((filesystem) => {
          const percentage = filesystem.sizeBytes > 0 ? (100 * filesystem.usedBytes) / filesystem.sizeBytes : 0;
          return (
            <div key={filesystem.mountPoint}>
              <div className="mb-2 flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-foreground-subtle" />
                <span className="font-medium">{filesystem.mountPoint}</span>
                <span className="truncate text-xs text-foreground-subtle">
                  {filesystem.device} · {filesystem.filesystemType}
                </span>
                <span className="ml-auto text-xs whitespace-nowrap text-foreground-muted">
                  {formatBytes(filesystem.usedBytes, { maximumFractionDigits: 1 })} / {formatBytes(filesystem.sizeBytes, { maximumFractionDigits: 1 })} · <span className="font-medium text-foreground">{percentage.toFixed(0)}%</span>
                </span>
              </div>
              <ProgressBar value={percentage} tone={PROGRESS_TONES[readUsageTone(percentage)]} size="small" />
            </div>
          );
        })}
      </div>
    </ChartPanel>
  );
}
