"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { GpuDevice, MachineInventory } from "@/collector/types";
import { MachineIllustration } from "@/components/machine/machine-illustration";
import {
  assignFilesystemsToDisks,
  buildMachineModel,
  readCardElementId,
  readFormFactorLabel,
} from "@/components/machine/machine-layout";
import { MachineSelectionProvider } from "@/components/machine/machine-part";
import { MemoryDetailCard } from "@/components/machine/memory-detail-card";
import { NetworkDetailCard } from "@/components/machine/network-detail-card";
import { GpuDetailCard, ProcessorDetailCard, SystemDetailCard } from "@/components/machine/part-detail-cards";
import { OtherFilesystemsCard, StorageDetailCard } from "@/components/machine/storage-detail-cards";
import { Card } from "@/components/primitives/card";
import { useLiveStream } from "@/hooks/use-live-stream";
import type { FilesystemUsageRecord } from "@/lib/queries/history-queries";
import type { LiveSystemSample } from "@/lib/queries/live-types";

function PartSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xs tracking-[0.08em] text-foreground-muted uppercase">
        {title}
        {count !== undefined && <span className="text-foreground-faint">{count}</span>}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function EmptyPart({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-line-strong/80 px-4 py-5 text-center text-foreground-subtle">
      {children}
    </div>
  );
}

/**
 * The Machine page body: the interactive illustration (sticky on wide screens) next to the detail
 * cards. Selecting a part in either place highlights it in both; selecting it in the drawing also
 * scrolls its card into view. Live readings come from the `system` stream.
 *
 * @example
 * <MachineExplorer inventory={inventory} gpus={gpus} filesystems={filesystems} hostname="homelab" initialSample={sample} />
 */
export function MachineExplorer({
  inventory,
  gpus,
  filesystems,
  hostname,
  initialSample,
}: {
  inventory: MachineInventory;
  gpus: GpuDevice[];
  filesystems: FilesystemUsageRecord[];
  hostname: string;
  initialSample: LiveSystemSample | null;
}) {
  const [sample, setSample] = useState(initialSample);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  useLiveStream("system", setSample);
  const model = useMemo(() => buildMachineModel(inventory, gpus), [inventory, gpus]);
  const { byDisk, unassigned } = useMemo(
    () => assignFilesystemsToDisks(inventory.storage, filesystems),
    [inventory.storage, filesystems],
  );
  const selectPart = useCallback((partId: string, origin: "illustration" | "card") => {
    setSelectedPartId((current) => (current === partId && origin === "card" ? null : partId));
    if (origin === "illustration")
      document.getElementById(readCardElementId(partId))?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  const formFactorLabel = readFormFactorLabel(inventory.formFactor);
  const chassisDescription =
    inventory.chassisDescription?.toLowerCase() === formFactorLabel.toLowerCase() ? null : inventory.chassisDescription;
  const subtitle = [formFactorLabel, chassisDescription, hostname].filter(Boolean).join(" · ");
  return (
    <MachineSelectionProvider selectedPartId={selectedPartId} selectPart={selectPart}>
      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-4 sm:p-6 xl:sticky xl:top-6">
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="font-display text-sm font-medium">Inside the machine</div>
            <div className="text-xs text-foreground-subtle">{subtitle}</div>
            <div className="ml-auto text-xs text-foreground-faint">Click a part for details</div>
          </div>
          <MachineIllustration inventory={inventory} model={model} sample={sample} />
        </Card>

        <div className="space-y-8">
          <PartSection title="Motherboard & system">
            <SystemDetailCard inventory={inventory} hostname={hostname} />
          </PartSection>
          <PartSection title="Processors" count={inventory.processors.length}>
            {inventory.processors.length === 0 && <EmptyPart>No processor details reported.</EmptyPart>}
            {inventory.processors.map((processor, processorIndex) => (
              <ProcessorDetailCard
                key={processorIndex}
                processor={processor}
                processorIndex={processorIndex}
                processorCount={inventory.processors.length}
                sample={sample}
              />
            ))}
          </PartSection>
          <PartSection title="Graphics" count={gpus.length}>
            {gpus.length === 0 && <EmptyPart>No GPU detected.</EmptyPart>}
            {gpus.map((gpu) => (
              <GpuDetailCard key={gpu.index} gpu={gpu} sample={sample} />
            ))}
          </PartSection>
          <PartSection title="Memory">
            <MemoryDetailCard memory={inventory.memory} slots={model.memorySlots} sample={sample} />
          </PartSection>
          <PartSection title="Storage" count={inventory.storage.length}>
            {inventory.storage.length === 0 && <EmptyPart>No disks reported.</EmptyPart>}
            {inventory.storage.map((device) => (
              <StorageDetailCard
                key={device.name}
                device={device}
                filesystems={byDisk.get(device.name) ?? []}
                sample={sample}
              />
            ))}
            {unassigned.length > 0 && <OtherFilesystemsCard filesystems={unassigned} />}
          </PartSection>
          <PartSection title="Network" count={inventory.networkAdapters.length}>
            {inventory.networkAdapters.length === 0 && <EmptyPart>No network adapters reported.</EmptyPart>}
            {inventory.networkAdapters.map((adapter) => (
              <NetworkDetailCard key={adapter.interfaceName} adapter={adapter} sample={sample} />
            ))}
          </PartSection>
        </div>
      </div>
    </MachineSelectionProvider>
  );
}
