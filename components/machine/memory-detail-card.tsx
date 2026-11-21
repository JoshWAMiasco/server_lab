"use client";

import { MemoryStick } from "lucide-react";
import type { MemoryInventory } from "@/collector/types";
import { summarizeMemory, type MemorySlot } from "@/components/machine/machine-layout";
import { useMachineSelection } from "@/components/machine/machine-part";
import { DetailList, LiveMeter, NotReported, PartCard } from "@/components/machine/part-detail-cards";
import { Badge } from "@/components/primitives/badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/primitives/table";
import { readUsageTone } from "@/components/resources/metric-tones";
import type { LiveSystemSample } from "@/lib/queries/live-types";
import { formatBytes } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

const SOURCE_LABELS: Record<MemoryInventory["source"], string> = {
  dmidecode: "dmidecode (hardware inventory unit)",
  edac: "EDAC (kernel)",
  none: "No module details",
};

function formatSize(byteCount: number): string {
  return formatBytes(byteCount, { maximumFractionDigits: 0 });
}

function OptionalCell({ value }: { value: string | number | null }) {
  return <>{value === null || value === "" ? <NotReported /> : value}</>;
}

/**
 * Memory: slots used out of total, installed and maximum capacity, live usage, and one table row
 * per slot (empty slots dimmed). The row of the selected slot is highlighted.
 *
 * @example
 * <MemoryDetailCard memory={inventory.memory} slots={model.memorySlots} sample={sample} />
 */
export function MemoryDetailCard({
  memory,
  slots,
  sample,
}: {
  memory: MemoryInventory;
  slots: readonly MemorySlot[];
  sample: LiveSystemSample | null;
}) {
  const { selectedPartId } = useMachineSelection();
  const filledSlots = slots.filter((slot) => slot.memoryModule !== null);
  const installedBytes = filledSlots.reduce((total, slot) => total + (slot.memoryModule?.sizeBytes ?? 0), 0);
  const usagePercentage = sample && sample.memoryTotal > 0 ? (100 * sample.memoryUsed) / sample.memoryTotal : null;
  const swapPercentage = sample && sample.swapTotal > 0 ? (100 * sample.swapUsed) / sample.swapTotal : null;
  return (
    <PartCard
      partId="memory"
      icon={<MemoryStick className="h-4 w-4" />}
      title="Memory"
      subtitle={summarizeMemory(slots, formatSize)}
      badges={<Badge tone="info">{`${filledSlots.length} / ${slots.length} slots`}</Badge>}
    >
      {sample && usagePercentage !== null && (
        <div className="mb-4 grid grid-cols-2 gap-4">
          <LiveMeter
            label="Used"
            value={`${formatBytes(sample.memoryUsed, { maximumFractionDigits: 1 })} / ${formatSize(sample.memoryTotal)}`}
            percentage={usagePercentage}
            tone={readUsageTone(usagePercentage)}
          />
          <LiveMeter
            label="Swap"
            value={
              sample.swapTotal > 0
                ? `${formatBytes(sample.swapUsed, { maximumFractionDigits: 1 })} / ${formatSize(sample.swapTotal)}`
                : "none"
            }
            percentage={swapPercentage}
            tone={readUsageTone(swapPercentage)}
          />
        </div>
      )}
      <DetailList
        rows={[
          ["Slots", `${filledSlots.length} used of ${slots.length}${memory.slotCount === null ? " (estimated)" : ""}`],
          [
            "Installed",
            installedBytes > 0
              ? formatSize(installedBytes)
              : sample
                ? `${formatSize(sample.memoryTotal)} visible to the OS`
                : null,
          ],
          ["Maximum", memory.maximumCapacityBytes === null ? null : formatSize(memory.maximumCapacityBytes)],
          ["Source", SOURCE_LABELS[memory.source]],
        ]}
      />
      <div className="-mx-5 mt-4 overflow-x-auto">
        <Table size="small" appearance="list" className="text-xs whitespace-nowrap">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Slot</TableHeaderCell>
              <TableHeaderCell>Size</TableHeaderCell>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Form factor</TableHeaderCell>
              <TableHeaderCell>Speed</TableHeaderCell>
              <TableHeaderCell>Manufacturer</TableHeaderCell>
              <TableHeaderCell>Part number</TableHeaderCell>
              <TableHeaderCell>Serial</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {slots.map((slot) => {
              const memoryModule = slot.memoryModule;
              const isSelected = selectedPartId === `memory-slot-${slot.slotIndex}`;
              const speed = memoryModule
                ? (memoryModule.configuredSpeedMegatransfers ?? memoryModule.speedMegatransfers)
                : null;
              return (
                <TableRow
                  key={slot.slotIndex}
                  className={mergeClassNames(!memoryModule && "opacity-50", isSelected && "[&>td]:bg-brand/10")}
                >
                  <TableCell className="font-medium">{slot.slotLabel ?? `Slot ${slot.slotIndex + 1}`}</TableCell>
                  {memoryModule ? (
                    <>
                      <TableCell>{formatSize(memoryModule.sizeBytes ?? 0)}</TableCell>
                      <TableCell>
                        <OptionalCell value={memoryModule.type} />
                      </TableCell>
                      <TableCell>
                        <OptionalCell value={memoryModule.formFactor} />
                      </TableCell>
                      <TableCell>{speed === null ? <NotReported /> : `${speed} MT/s`}</TableCell>
                      <TableCell>
                        <OptionalCell value={memoryModule.manufacturer} />
                      </TableCell>
                      <TableCell className="font-mono">
                        <OptionalCell value={memoryModule.partNumber} />
                      </TableCell>
                      <TableCell className="font-mono">
                        <OptionalCell value={memoryModule.serialNumber} />
                      </TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={7} className="text-foreground-subtle italic">
                      Empty
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </PartCard>
  );
}
