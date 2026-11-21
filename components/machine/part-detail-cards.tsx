"use client";

import { CircuitBoard, Cpu, Crosshair, Gpu } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { GpuDevice, MachineInventory, ProcessorInventory } from "@/collector/types";
import {
  formatClockSpeed,
  isIntegratedGpu,
  readCardElementId,
  readCardIdentifier,
  readFormFactorLabel,
} from "@/components/machine/machine-layout";
import { useMachineSelection } from "@/components/machine/machine-part";
import { Badge, type BadgeTone } from "@/components/primitives/badge";
import { Card } from "@/components/primitives/card";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { readTemperatureTone, readUsageTone } from "@/components/resources/metric-tones";
import type { LiveSystemSample } from "@/lib/queries/live-types";
import { formatBytes } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

export type DetailRow = readonly [label: string, value: ReactNode];

const PROGRESS_TONES = { success: "success", warning: "warning", danger: "danger", slate: "dark" } as const;
const TEXT_TONES = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  slate: "text-foreground-muted",
} as const;
const GPU_VENDOR_BADGES: Record<GpuDevice["vendor"], { name: string; tone: BadgeTone }> = {
  nvidia: { name: "NVIDIA", tone: "success" },
  amd: { name: "AMD", tone: "danger" },
  intel: { name: "Intel", tone: "info" },
};

function joinPresent(values: readonly (string | null | undefined)[], separator = " "): string | null {
  const present = values.filter((value): value is string => Boolean(value && value.trim()));
  return present.length > 0 ? present.join(separator) : null;
}

/**
 * The placeholder for a value the host did not report.
 *
 * @example
 * <NotReported />
 */
export function NotReported() {
  return <span className="text-foreground-faint italic">Not reported</span>;
}

/**
 * A two-column label/value list. Empty values (null, undefined, "") show "Not reported".
 *
 * @example
 * <DetailList rows={[["Vendor", "LENOVO"], ["Serial", null]]} />
 */
export function DetailList({ rows }: { rows: readonly DetailRow[] }) {
  return (
    <dl className="grid grid-cols-[minmax(6.5rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="text-foreground-muted">{label}</dt>
          <dd className="min-w-0 break-words">
            {value === null || value === undefined || value === "" ? <NotReported /> : value}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * A live meter row: label, value text coloured by tone, and a thin bar when a percentage is given.
 *
 * @example
 * <LiveMeter label="Usage" value="37%" percentage={37} tone="success" />
 */
export function LiveMeter({
  label,
  value,
  percentage,
  tone,
}: {
  label: string;
  value: string;
  percentage?: number | null;
  tone: keyof typeof PROGRESS_TONES;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="tracking-[0.08em] text-foreground-muted uppercase">{label}</span>
        <span className={mergeClassNames("ml-auto font-medium", TEXT_TONES[tone])}>{value}</span>
      </div>
      {percentage !== undefined && percentage !== null && (
        <ProgressBar value={percentage} tone={PROGRESS_TONES[tone]} size="extra-small" />
      )}
    </div>
  );
}

/**
 * The frame of every detail card: icon, title, subtitle, badges and a button that highlights the
 * part in the illustration. It gets a ring while its part is selected.
 *
 * @example
 * <PartCard partId="processor-0" icon={<Cpu className="h-4 w-4" />} title="Ryzen 7 5700G">…</PartCard>
 */
export function PartCard({
  partId,
  icon,
  title,
  subtitle,
  badges,
  children,
  className,
}: {
  partId: string;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { selectedPartId, selectPart } = useMachineSelection();
  const isSelected = selectedPartId !== null && readCardIdentifier(selectedPartId) === partId;
  return (
    <Card
      id={readCardElementId(partId)}
      className={mergeClassNames(
        "scroll-mt-24 p-5 transition-shadow duration-300",
        isSelected && "ring-2 ring-brand ring-offset-2 ring-offset-canvas",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-dashed border-line-strong/80 text-foreground-muted">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-medium break-words">{title}</div>
          {subtitle && <div className="mt-0.5 truncate text-xs text-foreground-subtle">{subtitle}</div>}
        </div>
        {badges && <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{badges}</div>}
        <button
          type="button"
          onClick={() => selectPart(partId, "card")}
          aria-pressed={isSelected}
          aria-label="Highlight in the machine illustration"
          title="Highlight in the machine illustration"
          className={mergeClassNames(
            "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-surface-muted hover:text-foreground",
            isSelected && "text-brand",
          )}
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/**
 * Motherboard, system, BIOS, chassis and operating system details.
 *
 * @example
 * <SystemDetailCard inventory={inventory} hostname="homelab" />
 */
export function SystemDetailCard({ inventory, hostname }: { inventory: MachineInventory; hostname: string }) {
  const { system, motherboard, bios, operatingSystem } = inventory;
  return (
    <PartCard
      partId="motherboard"
      icon={<CircuitBoard className="h-4 w-4" />}
      title={joinPresent([motherboard.vendor, motherboard.model]) ?? "Motherboard"}
      subtitle={joinPresent([system.vendor, system.product])}
      badges={<Badge tone="slate">{readFormFactorLabel(inventory.formFactor)}</Badge>}
    >
      <DetailList
        rows={[
          ["Hostname", hostname],
          ["System", joinPresent([system.vendor, system.product])],
          ["System version", system.version],
          ["System serial", system.serialNumber],
          ["Board", joinPresent([motherboard.vendor, motherboard.model])],
          ["Board version", motherboard.version],
          ["Board serial", motherboard.serialNumber],
          ["BIOS", joinPresent([bios.vendor, bios.version], " · ")],
          ["BIOS date", bios.releaseDate],
          ["Chassis", inventory.chassisDescription],
          ["Form factor", readFormFactorLabel(inventory.formFactor)],
          ["OS", operatingSystem.name],
          ["Kernel", operatingSystem.kernel],
          ["Architecture", operatingSystem.architecture],
        ]}
      />
    </PartCard>
  );
}

/**
 * One processor: model, socket, cores, clocks, caches and virtualization, with live usage and
 * package temperature (host-wide when there are several sockets).
 *
 * @example
 * <ProcessorDetailCard processor={processor} processorIndex={0} processorCount={1} sample={sample} />
 */
export function ProcessorDetailCard({
  processor,
  processorIndex,
  processorCount,
  sample,
}: {
  processor: ProcessorInventory;
  processorIndex: number;
  processorCount: number;
  sample: LiveSystemSample | null;
}) {
  const cores =
    processor.coreCount === null
      ? null
      : `${processor.coreCount} cores${processor.threadCount === null ? "" : ` · ${processor.threadCount} threads`}`;
  const caches =
    processor.caches.length > 0
      ? processor.caches
          .map((cache) => `${cache.level} ${formatBytes(cache.bytes, { maximumFractionDigits: 1 })}`)
          .join(" · ")
      : null;
  return (
    <PartCard
      partId={`processor-${processorIndex}`}
      icon={<Cpu className="h-4 w-4" />}
      title={processor.model}
      subtitle={joinPresent(
        [processorCount > 1 ? `Socket ${processorIndex}` : null, processor.socket, processor.architecture],
        " · ",
      )}
    >
      {sample && (
        <div className="mb-4 grid grid-cols-2 gap-4">
          <LiveMeter
            label={processorCount > 1 ? "Usage (all)" : "Usage"}
            value={`${sample.cpuPercent.toFixed(0)}%`}
            percentage={sample.cpuPercent}
            tone={readUsageTone(sample.cpuPercent)}
          />
          <LiveMeter
            label="Temperature"
            value={sample.cpuTemperatureCelsius === null ? "—" : `${sample.cpuTemperatureCelsius.toFixed(0)}°C`}
            tone={readTemperatureTone(sample.cpuTemperatureCelsius)}
          />
        </div>
      )}
      <DetailList
        rows={[
          ["Vendor", processor.vendor],
          ["Socket", processor.socket],
          ["Architecture", processor.architecture],
          ["Cores", cores],
          ["Base clock", processor.baseMegahertz === null ? null : formatClockSpeed(processor.baseMegahertz)],
          ["Max clock", processor.maximumMegahertz === null ? null : formatClockSpeed(processor.maximumMegahertz)],
          ["Caches", caches],
          ["Virtualization", processor.virtualization],
        ]}
      />
    </PartCard>
  );
}

/**
 * One GPU: vendor badge, model, PCI address, driver, VRAM, and live utilization, VRAM use,
 * temperature and power — or why stats are unavailable.
 *
 * @example
 * <GpuDetailCard gpu={gpu} sample={sample} />
 */
export function GpuDetailCard({ gpu, sample }: { gpu: GpuDevice; sample: LiveSystemSample | null }) {
  const reading = sample?.gpus.find((candidate) => candidate.gpuIndex === gpu.index) ?? null;
  const vendor = GPU_VENDOR_BADGES[gpu.vendor];
  const memoryPercentage =
    reading?.memoryUsed !== null && reading?.memoryUsed !== undefined && reading.memoryTotal
      ? (100 * reading.memoryUsed) / reading.memoryTotal
      : null;
  return (
    <PartCard
      partId={`gpu-${gpu.index}`}
      icon={<Gpu className="h-4 w-4" />}
      title={gpu.name}
      subtitle={`GPU ${gpu.index} · ${gpu.pciAddress}`}
      badges={
        <>
          <Badge tone={vendor.tone}>{vendor.name}</Badge>
          <Badge tone="slate">{isIntegratedGpu(gpu) ? "Integrated" : "Discrete"}</Badge>
        </>
      }
    >
      {gpu.statsAvailable ? (
        reading && (
          <div className="mb-4 grid grid-cols-2 gap-4">
            <LiveMeter
              label="Utilization"
              value={reading.utilizationPercent === null ? "—" : `${reading.utilizationPercent.toFixed(0)}%`}
              percentage={reading.utilizationPercent}
              tone={readUsageTone(reading.utilizationPercent)}
            />
            <LiveMeter
              label="Temperature"
              value={reading.temperatureCelsius === null ? "—" : `${reading.temperatureCelsius.toFixed(0)}°C`}
              tone={readTemperatureTone(reading.temperatureCelsius)}
            />
            {memoryPercentage !== null && reading.memoryUsed !== null && reading.memoryTotal !== null && (
              <LiveMeter
                label="VRAM"
                value={`${formatBytes(reading.memoryUsed, { maximumFractionDigits: 1 })} / ${formatBytes(reading.memoryTotal, { maximumFractionDigits: 0 })}`}
                percentage={memoryPercentage}
                tone={readUsageTone(memoryPercentage)}
              />
            )}
            {reading.powerWatts !== null && (
              <LiveMeter label="Power" value={`${reading.powerWatts.toFixed(0)} W`} tone="slate" />
            )}
          </div>
        )
      ) : (
        <div className="mb-4 border border-dashed border-warning/50 bg-warning/5 px-3 py-2 text-xs text-warning">
          {gpu.unavailableReason ?? "Live stats are unavailable for this GPU."}
        </div>
      )}
      <DetailList
        rows={[
          ["Vendor", vendor.name],
          ["Model", gpu.name],
          [
            "PCI address",
            <span key="pci" className="font-mono text-xs">
              {gpu.pciAddress}
            </span>,
          ],
          ["Driver", gpu.driver],
          ["VRAM", reading?.memoryTotal ? formatBytes(reading.memoryTotal, { maximumFractionDigits: 0 }) : null],
        ]}
      />
    </PartCard>
  );
}
