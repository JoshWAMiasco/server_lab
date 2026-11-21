"use client";

import { Disc3, FolderTree, HardDrive, MemoryStick, Usb } from "lucide-react";
import type { ReactNode } from "react";
import type { StorageDevice, StorageKind } from "@/collector/types";
import { DetailList, LiveMeter, PartCard } from "@/components/machine/part-detail-cards";
import { Badge } from "@/components/primitives/badge";
import { Card } from "@/components/primitives/card";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { readUsageTone } from "@/components/resources/metric-tones";
import type { FilesystemUsageRecord } from "@/lib/queries/history-queries";
import type { LiveSystemSample } from "@/lib/queries/live-types";
import { formatBytes } from "@/utilities/format-number";

const PROGRESS_TONES = { success: "success", warning: "warning", danger: "danger", slate: "dark" } as const;

const KIND_DETAILS: Record<StorageKind, { label: string; icon: ReactNode }> = {
  nvme: { label: "NVMe SSD", icon: <MemoryStick className="h-4 w-4" /> },
  ssd: { label: "SATA SSD", icon: <HardDrive className="h-4 w-4" /> },
  hdd: { label: "Hard disk", icon: <Disc3 className="h-4 w-4" /> },
  usb: { label: "USB drive", icon: <Usb className="h-4 w-4" /> },
  other: { label: "Disk", icon: <HardDrive className="h-4 w-4" /> },
};

function FilesystemList({ filesystems }: { filesystems: readonly FilesystemUsageRecord[] }) {
  return (
    <div className="space-y-3">
      {filesystems.map((filesystem) => {
        const percentage = filesystem.sizeBytes > 0 ? (100 * filesystem.usedBytes) / filesystem.sizeBytes : 0;
        return (
          <div key={filesystem.mountPoint}>
            <div className="mb-1.5 flex items-center gap-2 text-xs">
              <span className="font-medium text-foreground">{filesystem.mountPoint}</span>
              <span className="truncate text-foreground-subtle">
                {filesystem.device} · {filesystem.filesystemType}
              </span>
              <span className="ml-auto whitespace-nowrap text-foreground-muted">
                {formatBytes(filesystem.usedBytes, { maximumFractionDigits: 1 })} /{" "}
                {formatBytes(filesystem.sizeBytes, { maximumFractionDigits: 1 })} ·{" "}
                <span className="font-medium text-foreground">{percentage.toFixed(0)}%</span>
              </span>
            </div>
            <ProgressBar value={percentage} tone={PROGRESS_TONES[readUsageTone(percentage)]} size="extra-small" />
          </div>
        );
      })}
    </div>
  );
}

/**
 * One disk: kind, model, vendor, size, interface, serial and firmware, live read/write rates, and
 * the mounted partitions on it with usage bars.
 *
 * @example
 * <StorageDetailCard device={disk} filesystems={byDisk.get(disk.name) ?? []} sample={sample} />
 */
export function StorageDetailCard({
  device,
  filesystems,
  sample,
}: {
  device: StorageDevice;
  filesystems: readonly FilesystemUsageRecord[];
  sample: LiveSystemSample | null;
}) {
  const kind = KIND_DETAILS[device.kind];
  const reading = sample?.disks.find((disk) => disk.device === device.name) ?? null;
  return (
    <PartCard
      partId={`storage-${device.name}`}
      icon={kind.icon}
      title={device.model ?? device.name}
      subtitle={`/dev/${device.name}`}
      badges={<Badge tone="slate">{kind.label}</Badge>}
    >
      {reading && (
        <div className="mb-4 grid grid-cols-2 gap-4">
          <LiveMeter
            label="Read"
            value={`${formatBytes(reading.readBytesPerSecond, { maximumFractionDigits: 1 })}/s`}
            tone={reading.readBytesPerSecond > 0 ? "success" : "slate"}
          />
          <LiveMeter
            label="Write"
            value={`${formatBytes(reading.writtenBytesPerSecond, { maximumFractionDigits: 1 })}/s`}
            tone={reading.writtenBytesPerSecond > 0 ? "success" : "slate"}
          />
        </div>
      )}
      <DetailList
        rows={[
          ["Model", device.model],
          ["Vendor", device.vendor],
          ["Size", formatBytes(device.sizeBytes, { maximumFractionDigits: 1 })],
          ["Interface", [kind.label, device.transport?.toUpperCase()].filter(Boolean).join(" · ")],
          ["Serial", device.serialNumber ? <span className="font-mono text-xs">{device.serialNumber}</span> : null],
          ["Firmware", device.revision],
        ]}
      />
      <div className="mt-4 border-t border-dashed border-line-strong/80 pt-4">
        <div className="mb-3 text-xs tracking-[0.08em] text-foreground-muted uppercase">Mounted partitions</div>
        {filesystems.length > 0 ? (
          <FilesystemList filesystems={filesystems} />
        ) : (
          <div className="text-xs text-foreground-subtle">No mounted filesystem on this disk.</div>
        )}
      </div>
    </PartCard>
  );
}

/**
 * Filesystems that sit on no listed disk (LVM, RAID, network mounts).
 *
 * @example
 * <OtherFilesystemsCard filesystems={unassigned} />
 */
export function OtherFilesystemsCard({ filesystems }: { filesystems: readonly FilesystemUsageRecord[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-dashed border-line-strong/80 text-foreground-muted">
          <FolderTree className="h-4 w-4" />
        </div>
        <div>
          <div className="font-display text-sm font-medium">Other filesystems</div>
          <div className="mt-0.5 text-xs text-foreground-subtle">
            LVM, RAID or network mounts not tied to a single disk
          </div>
        </div>
      </div>
      <FilesystemList filesystems={filesystems} />
    </Card>
  );
}
