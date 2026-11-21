import { Cpu, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import type { GpuDevice, MachineInventory } from "@/collector/types";
import { MachineExplorer } from "@/components/machine/machine-explorer";
import { buildMachineDescription } from "@/components/machine/machine-layout";
import { EmptyState } from "@/components/primitives/empty-state";
import { PageHeader } from "@/components/primitives/page-header";
import { StaticAlert } from "@/components/primitives/static-alert";
import { getDatabase } from "@/lib/database/client";
import { readCapability } from "@/lib/database/key-value";
import { readLatestFilesystems } from "@/lib/queries/history-queries";
import { readLatestSystemSample } from "@/lib/queries/system-queries";

export const metadata: Metadata = { title: "Machine" };
export const dynamic = "force-dynamic";

export default function MachinePage() {
  const database = getDatabase();
  const inventory = readCapability<MachineInventory | null>(database, "machineInventory", null);
  const hostname = readCapability<string>(database, "hostname", "");
  if (!inventory) {
    return (
      <>
        <PageHeader
          title="Machine"
          description="Every part of this server: board, CPU, GPU, memory, storage and network."
        />
        <EmptyState
          className="mt-6 border border-dashed border-line-strong/80"
          icon={<Cpu className="h-10 w-10 stroke-[1]" />}
          title="No hardware inventory yet"
          description="The collector detects the hardware shortly after it starts and refreshes it every 10 minutes. Check that the serverlab-collector service is running."
        />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Machine" description={buildMachineDescription(inventory) || "Every part of this server."} />
      {!inventory.hasHardwareInventoryFile && (
        <StaticAlert
          tone="warning"
          variant="soft"
          className="mt-6"
          icon={<TriangleAlert className="mr-3 h-5 w-5 shrink-0" />}
        >
          Some details (serial numbers, memory slots) need the hardware inventory unit — rerun deploy/install.sh.
        </StaticAlert>
      )}
      <MachineExplorer
        inventory={inventory}
        gpus={readCapability<GpuDevice[]>(database, "gpus", [])}
        filesystems={readLatestFilesystems(database)}
        hostname={hostname}
        initialSample={readLatestSystemSample(database)}
      />
    </>
  );
}
