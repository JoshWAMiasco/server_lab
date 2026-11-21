"use client";

import type { GpuDevice, MachineInventory, NetworkAdapter, ProcessorInventory, StorageDevice } from "@/collector/types";
import {
  formatLinkSpeed,
  readShortProcessorName,
  type MachineModel,
  type MemorySlot,
  type PartBounds,
} from "@/components/machine/machine-layout";
import { MachinePart } from "@/components/machine/machine-part";
import { readTemperatureTone, readUsageTone } from "@/components/resources/metric-tones";
import type { LiveSystemSample } from "@/lib/queries/live-types";
import { formatBytes } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

/*
 * The drawing vocabulary shared by the four form-factor illustrations: board, socket, memory
 * stick, GPU, M.2 stick, drive bay, network port, fan and power supply. Every shape takes its
 * bounds in viewBox units and uses theme colours only, so it works in light and dark mode.
 */

export interface FormFactorProperties {
  inventory: MachineInventory;
  model: MachineModel;
  sample: LiveSystemSample | null;
}

export type LiveTone = "success" | "warning" | "danger" | "slate";

const TONE_RANK: Record<LiveTone, number> = { slate: 0, success: 1, warning: 2, danger: 3 };
const BADGE_CLASS_NAMES: Record<LiveTone, { box: string; text: string }> = {
  success: { box: "fill-surface stroke-success", text: "fill-success" },
  warning: { box: "fill-surface stroke-warning", text: "fill-warning" },
  danger: { box: "fill-surface stroke-danger", text: "fill-danger" },
  slate: { box: "fill-surface stroke-line-strong", text: "fill-foreground-muted" },
};
const GPU_VENDOR_CLASS_NAMES: Record<GpuDevice["vendor"], { body: string; text: string }> = {
  nvidia: { body: "fill-success/10 stroke-success", text: "fill-success" },
  amd: { body: "fill-danger/10 stroke-danger", text: "fill-danger" },
  intel: { body: "fill-info/10 stroke-info", text: "fill-info" },
};
const GPU_VENDOR_NAMES: Record<GpuDevice["vendor"], string> = { nvidia: "NVIDIA", amd: "AMD", intel: "Intel" };

function readWorstTone(...tones: LiveTone[]): LiveTone {
  return tones.reduce((worst, tone) => (TONE_RANK[tone] > TONE_RANK[worst] ? tone : worst), "slate");
}

function truncateText(text: string, maximumWidth: number, fontSize: number): string {
  const maximumCharacters = Math.max(1, Math.floor(maximumWidth / (fontSize * 0.58)));
  return text.length <= maximumCharacters ? text : `${text.slice(0, Math.max(1, maximumCharacters - 1))}…`;
}

function wrapText(text: string, maximumCharacters: number, maximumLines: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const lastLine = lines.at(-1);
    if (lastLine !== undefined && `${lastLine} ${word}`.length <= maximumCharacters)
      lines[lines.length - 1] = `${lastLine} ${word}`;
    else lines.push(word);
  }
  if (lines.length <= maximumLines) return lines;
  return [
    ...lines.slice(0, maximumLines - 1),
    `${lines
      .slice(maximumLines - 1)
      .join(" ")
      .slice(0, Math.max(1, maximumCharacters - 1))}…`,
  ];
}

function formatSize(byteCount: number): string {
  return formatBytes(byteCount, { maximumFractionDigits: 0 }).replace(" ", "");
}

/**
 * The live CPU reading for the socket badge: usage and package temperature, toned by the worse of the two.
 *
 * @example
 * readProcessorLive(sample); // { text: "37% · 52°C", tone: "success" }
 */
export function readProcessorLive(sample: LiveSystemSample | null): { text: string; tone: LiveTone } | null {
  if (!sample) return null;
  const temperature = sample.cpuTemperatureCelsius === null ? "" : ` · ${sample.cpuTemperatureCelsius.toFixed(0)}°C`;
  return {
    text: `${sample.cpuPercent.toFixed(0)}%${temperature}`,
    tone: readWorstTone(readUsageTone(sample.cpuPercent), readTemperatureTone(sample.cpuTemperatureCelsius)),
  };
}

/**
 * The live reading of one GPU for its badge, or null when the GPU reports nothing.
 *
 * @example
 * readGpuLive(sample, 0); // { text: "64% · 71°C", tone: "success" }
 */
export function readGpuLive(
  sample: LiveSystemSample | null,
  gpuIndex: number,
): { text: string; tone: LiveTone } | null {
  const reading = sample?.gpus.find((gpu) => gpu.gpuIndex === gpuIndex);
  if (!reading || (reading.utilizationPercent === null && reading.temperatureCelsius === null)) return null;
  const parts = [
    reading.utilizationPercent === null ? null : `${reading.utilizationPercent.toFixed(0)}%`,
    reading.temperatureCelsius === null ? null : `${reading.temperatureCelsius.toFixed(0)}°C`,
  ].filter(Boolean);
  return {
    text: parts.join(" · "),
    tone: readWorstTone(readUsageTone(reading.utilizationPercent), readTemperatureTone(reading.temperatureCelsius)),
  };
}

/**
 * The live memory usage for the badge next to the memory slots.
 *
 * @example
 * readMemoryLive(sample); // { text: "RAM 43%", tone: "success" }
 */
export function readMemoryLive(sample: LiveSystemSample | null): { text: string; tone: LiveTone } | null {
  if (!sample || sample.memoryTotal <= 0) return null;
  const percentage = (100 * sample.memoryUsed) / sample.memoryTotal;
  return { text: `RAM ${percentage.toFixed(0)}%`, tone: readUsageTone(percentage) };
}

/**
 * Whether a disk read or wrote anything in the latest sample.
 *
 * @example
 * isDiskActive(sample, "nvme0n1"); // true
 */
export function isDiskActive(sample: LiveSystemSample | null, diskName: string): boolean {
  const reading = sample?.disks.find((disk) => disk.device === diskName);
  return reading ? reading.readBytesPerSecond + reading.writtenBytesPerSecond > 0 : false;
}

/**
 * A small rounded reading pinned on a part, centred on (`x`, `y`).
 *
 * @example
 * <LiveBadge x={120} y={200} text="37% · 52°C" tone="success" />
 */
export function LiveBadge({ x, y, text, tone }: { x: number; y: number; text: string; tone: LiveTone }) {
  const width = text.length * 6 + 12;
  return (
    <g className="pointer-events-none">
      <rect
        x={x - width / 2}
        y={y - 9}
        width={width}
        height={18}
        rx={9}
        strokeWidth={1.25}
        className={BADGE_CLASS_NAMES[tone].box}
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10.5}
        fontWeight={600}
        className={BADGE_CLASS_NAMES[tone].text}
      >
        {text}
      </text>
    </g>
  );
}

/**
 * A "+N more" marker for parts that do not fit.
 *
 * @example
 * <MoreMarker x={400} y={300} count={3} />
 */
export function MoreMarker({ x, y, count }: { x: number; y: number; count: number }) {
  if (count <= 0) return null;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
      className="fill-foreground-muted"
    >
      +{count} more
    </text>
  );
}

/**
 * A small uppercase caption printed on the chassis or board.
 *
 * @example
 * <Caption x={40} y={30}>Rear I/O</Caption>
 */
export function Caption({
  x,
  y,
  anchor = "start",
  children,
}: {
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  children: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={9}
      letterSpacing={1.2}
      className="pointer-events-none fill-foreground-subtle uppercase"
    >
      {children}
    </text>
  );
}

/**
 * A fan seen from the front: frame, five blades and hub. Spins slowly unless reduced motion is set.
 *
 * @example
 * <FanShape centerX={80} centerY={110} radius={30} />
 */
export function FanShape({ centerX, centerY, radius }: { centerX: number; centerY: number; radius: number }) {
  const bladeRadius = radius * 0.86;
  const bladePath = `M0 0 C ${bladeRadius * 0.15} ${-bladeRadius * 0.55} ${bladeRadius * 0.7} ${-bladeRadius * 0.75} ${bladeRadius * 0.85} ${-bladeRadius * 0.3} C ${bladeRadius * 0.55} ${-bladeRadius * 0.3} ${bladeRadius * 0.25} ${-bladeRadius * 0.12} 0 0 Z`;
  return (
    <g className="pointer-events-none" aria-hidden="true">
      <rect
        x={centerX - radius - 4}
        y={centerY - radius - 4}
        width={2 * radius + 8}
        height={2 * radius + 8}
        rx={6}
        strokeWidth={1}
        className="fill-surface-muted stroke-line-strong"
      />
      <circle cx={centerX} cy={centerY} r={radius} strokeWidth={1} className="fill-surface stroke-line-strong" />
      <g transform={`translate(${centerX} ${centerY})`}>
        <g
          className="motion-safe:animate-[spin_6s_linear_infinite]"
          style={{ transformBox: "view-box", transformOrigin: "0 0" }}
        >
          {[0, 72, 144, 216, 288].map((angle) => (
            <path
              key={angle}
              d={bladePath}
              transform={`rotate(${angle})`}
              strokeWidth={0.75}
              className="fill-surface-strong stroke-foreground-faint"
            />
          ))}
        </g>
        <circle r={radius * 0.22} strokeWidth={1} className="fill-surface-muted stroke-foreground-faint" />
      </g>
    </g>
  );
}

/**
 * A power supply unit with its fan grille (decorative).
 *
 * @example
 * <PowerSupplyShape bounds={{ x: 40, y: 480, width: 260, height: 85 }} label="PSU" />
 */
export function PowerSupplyShape({ bounds, label }: { bounds: PartBounds; label: string }) {
  const grilleRadius = Math.min(bounds.height, bounds.width) * 0.32;
  return (
    <g className="pointer-events-none" aria-hidden="true">
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={4}
        strokeWidth={1.25}
        className="fill-surface-strong stroke-line-strong"
      />
      <circle
        cx={bounds.x + bounds.width - grilleRadius - 12}
        cy={bounds.y + bounds.height / 2}
        r={grilleRadius}
        strokeWidth={1}
        strokeDasharray="2 3"
        className="fill-none stroke-foreground-faint"
      />
      <circle
        cx={bounds.x + bounds.width - grilleRadius - 12}
        cy={bounds.y + bounds.height / 2}
        r={grilleRadius * 0.45}
        strokeWidth={1}
        strokeDasharray="2 3"
        className="fill-none stroke-foreground-faint"
      />
      <text
        x={bounds.x + 12}
        y={bounds.y + bounds.height / 2}
        dominantBaseline="central"
        fontSize={11}
        letterSpacing={1}
        className="fill-foreground-subtle"
      >
        {label}
      </text>
    </g>
  );
}

/**
 * The motherboard (or mainboard) as a clickable surface with faint traces and its model printed in a corner.
 *
 * @example
 * <BoardShape inventory={inventory} bounds={{ x: 120, y: 48, width: 400, height: 410 }} />
 */
export function BoardShape({
  inventory,
  bounds,
  path,
}: {
  inventory: MachineInventory;
  bounds: PartBounds;
  path?: string;
}) {
  const boardName =
    [inventory.motherboard.vendor, inventory.motherboard.model].filter(Boolean).join(" ") || "Motherboard";
  const shapeClassName = "fill-surface-subtle stroke-line-strong";
  return (
    <MachinePart partId="motherboard" label={`Motherboard · ${boardName}`} bounds={bounds}>
      {path ? (
        <path d={path} strokeWidth={1.5} className={shapeClassName} />
      ) : (
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx={6}
          strokeWidth={1.5}
          className={shapeClassName}
        />
      )}
      <g className="pointer-events-none stroke-line" strokeWidth={1} fill="none" aria-hidden="true">
        <path
          d={`M${bounds.x + bounds.width * 0.08} ${bounds.y + bounds.height * 0.55} h${bounds.width * 0.3} l${bounds.width * 0.06} ${bounds.height * 0.06} h${bounds.width * 0.25}`}
        />
        <path
          d={`M${bounds.x + bounds.width * 0.12} ${bounds.y + bounds.height * 0.58} h${bounds.width * 0.25} l${bounds.width * 0.06} ${bounds.height * 0.06} h${bounds.width * 0.2}`}
        />
        <path
          d={`M${bounds.x + bounds.width * 0.6} ${bounds.y + bounds.height * 0.08} v${bounds.height * 0.2} l${bounds.width * 0.05} ${bounds.height * 0.05}`}
        />
      </g>
      {[
        [bounds.x + 10, bounds.y + 10],
        [bounds.x + bounds.width - 10, bounds.y + 10],
        [bounds.x + 10, bounds.y + bounds.height - 10],
        [bounds.x + bounds.width - 10, bounds.y + bounds.height - 10],
      ].map(([holeX, holeY]) => (
        <circle
          key={`${holeX}-${holeY}`}
          cx={holeX}
          cy={holeY}
          r={3}
          strokeWidth={1}
          className="pointer-events-none fill-surface stroke-line-strong"
        />
      ))}
      <text
        x={bounds.x + bounds.width - 18}
        y={bounds.y + bounds.height - 18}
        textAnchor="end"
        fontSize={10}
        letterSpacing={1}
        className="pointer-events-none fill-foreground-faint uppercase"
      >
        {truncateText(boardName, bounds.width * 0.6, 10)}
      </text>
    </MachinePart>
  );
}

/**
 * One CPU socket: pin field, heat spreader, short model name, core count, an iGPU tag when the
 * processor has integrated graphics, and the live usage badge on its lower edge.
 *
 * @example
 * <ProcessorShape processor={inventory.processors[0]} processorIndex={0} bounds={{ x: 270, y: 90, width: 90, height: 90 }} sample={sample} />
 */
export function ProcessorShape({
  processor,
  processorIndex,
  bounds,
  sample,
  showLive = true,
}: {
  processor: ProcessorInventory;
  processorIndex: number;
  bounds: PartBounds;
  sample: LiveSystemSample | null;
  showLive?: boolean;
}) {
  const size = Math.min(bounds.width, bounds.height);
  const inset = size * 0.13;
  const fontSize = Math.max(8, Math.min(11, size / 8));
  const lines = wrapText(readShortProcessorName(processor.model), Math.floor((size - 2 * inset) / (fontSize * 0.6)), 2);
  const coreText =
    processor.coreCount === null
      ? null
      : `${processor.coreCount}C${processor.threadCount === null ? "" : `/${processor.threadCount}T`}`;
  const live = showLive ? readProcessorLive(sample) : null;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return (
    <MachinePart
      partId={`processor-${processorIndex}`}
      label={`CPU ${processorIndex} · ${processor.model}`}
      bounds={bounds}
    >
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={4}
        strokeWidth={1.25}
        className="fill-surface-strong stroke-foreground-subtle"
      />
      <rect
        x={bounds.x + inset / 2.5}
        y={bounds.y + inset / 2.5}
        width={bounds.width - (2 * inset) / 2.5}
        height={bounds.height - (2 * inset) / 2.5}
        rx={3}
        strokeWidth={1.5}
        strokeDasharray="1 2.5"
        className="fill-none stroke-foreground-faint"
      />
      <rect
        x={bounds.x + inset}
        y={bounds.y + inset}
        width={bounds.width - 2 * inset}
        height={bounds.height - 2 * inset}
        rx={3}
        strokeWidth={1.25}
        className="fill-surface stroke-foreground-muted"
      />
      <text
        x={centerX}
        y={bounds.y + inset + fontSize + 2}
        textAnchor="middle"
        fontSize={fontSize * 0.8}
        letterSpacing={1}
        className="fill-foreground-subtle uppercase"
      >
        {processor.vendor ?? "CPU"}
      </text>
      {lines.map((line, lineIndex) => (
        <text
          key={line}
          x={centerX}
          y={centerY + (lineIndex - (lines.length - 1) / 2) * (fontSize + 2)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={600}
          className="fill-foreground"
        >
          {line}
        </text>
      ))}
      {coreText && (
        <text
          x={centerX}
          y={bounds.y + bounds.height - inset - 5}
          textAnchor="middle"
          fontSize={fontSize * 0.85}
          className="fill-foreground-muted"
        >
          {coreText}
        </text>
      )}
      {live && <LiveBadge x={centerX} y={bounds.y + bounds.height} text={live.text} tone={live.tone} />}
    </MachinePart>
  );
}

/**
 * A small "iGPU" tag drawn on a processor for integrated graphics (its own clickable part).
 *
 * @example
 * <IntegratedGpuTag gpu={gpu} x={300} y={95} />
 */
export function IntegratedGpuTag({ gpu, x, y }: { gpu: GpuDevice; x: number; y: number }) {
  const bounds = { x, y, width: 34, height: 14 };
  return (
    <MachinePart partId={`gpu-${gpu.index}`} label={`GPU ${gpu.index} · ${gpu.name} (integrated)`} bounds={bounds}>
      <rect
        x={x}
        y={y}
        width={bounds.width}
        height={bounds.height}
        rx={3}
        strokeWidth={1}
        className={GPU_VENDOR_CLASS_NAMES[gpu.vendor].body}
      />
      <text
        x={x + bounds.width / 2}
        y={y + bounds.height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8.5}
        fontWeight={600}
        className={GPU_VENDOR_CLASS_NAMES[gpu.vendor].text}
      >
        iGPU
      </text>
    </MachinePart>
  );
}

/**
 * One memory slot: a populated module with chips and its size, or an empty dashed slot.
 * `orientation` is vertical for desktop and server DIMMs, horizontal for laptop SO-DIMMs.
 *
 * @example
 * <MemorySlotShape slot={slot} bounds={{ x: 400, y: 70, width: 14, height: 160 }} orientation="vertical" />
 */
export function MemorySlotShape({
  slot,
  bounds,
  orientation,
}: {
  slot: MemorySlot;
  bounds: PartBounds;
  orientation: "vertical" | "horizontal";
}) {
  const slotName = slot.slotLabel ?? `Slot ${slot.slotIndex + 1}`;
  const memoryModule = slot.memoryModule;
  const isVertical = orientation === "vertical";
  const thickness = isVertical ? bounds.width : bounds.height;
  const length = isVertical ? bounds.height : bounds.width;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  if (!memoryModule) {
    return (
      <MachinePart partId={`memory-slot-${slot.slotIndex}`} label={`${slotName} · empty slot`} bounds={bounds}>
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx={2}
          strokeWidth={1}
          strokeDasharray="3 3"
          className="fill-surface stroke-line-strong"
        />
      </MachinePart>
    );
  }
  const speed = memoryModule.configuredSpeedMegatransfers ?? memoryModule.speedMegatransfers;
  const sizeText = formatSize(memoryModule.sizeBytes ?? 0);
  const chipCount = Math.max(2, Math.min(8, Math.floor(length / 22)));
  const chipLength = (length * 0.7) / chipCount;
  const fontSize = Math.max(7, Math.min(10, thickness * 0.62));
  return (
    <MachinePart
      partId={`memory-slot-${slot.slotIndex}`}
      label={[slotName, sizeText, memoryModule.type, speed ? `${speed} MT/s` : null].filter(Boolean).join(" · ")}
      bounds={bounds}
    >
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={2}
        strokeWidth={1.25}
        className="fill-info/15 stroke-info"
      />
      {Array.from({ length: chipCount }, (_, chipIndex) => {
        const chipOffset = length * 0.04 + (chipIndex * (length * 0.92 - chipLength)) / Math.max(1, chipCount - 1);
        return isVertical ? (
          <rect
            key={chipIndex}
            x={bounds.x + thickness * 0.2}
            y={bounds.y + chipOffset}
            width={thickness * 0.6}
            height={chipLength}
            rx={1}
            className="fill-info/30"
          />
        ) : (
          <rect
            key={chipIndex}
            x={bounds.x + chipOffset}
            y={bounds.y + thickness * 0.2}
            width={chipLength}
            height={thickness * 0.6}
            rx={1}
            className="fill-info/30"
          />
        );
      })}
      {thickness >= 8 && (
        <text
          x={centerX}
          y={centerY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={600}
          transform={isVertical ? `rotate(-90 ${centerX} ${centerY})` : undefined}
          className="pointer-events-none fill-foreground"
        >
          {sizeText}
          {!isVertical && memoryModule.type ? ` ${memoryModule.type}` : ""}
        </text>
      )}
    </MachinePart>
  );
}

/**
 * A discrete GPU: a PCIe card with shroud fans (`variant="card"`) or a chip on the board
 * (`variant="chip"`, laptops and mini PCs), coloured by vendor, with its live badge.
 *
 * @example
 * <GpuShape gpu={gpu} bounds={{ x: 50, y: 260, width: 370, height: 40 }} sample={sample} variant="card" />
 */
export function GpuShape({
  gpu,
  bounds,
  sample,
  variant,
}: {
  gpu: GpuDevice;
  bounds: PartBounds;
  sample: LiveSystemSample | null;
  variant: "card" | "chip";
}) {
  const vendorClassNames = GPU_VENDOR_CLASS_NAMES[gpu.vendor];
  const live = readGpuLive(sample, gpu.index);
  const label = `GPU ${gpu.index} · ${gpu.name}`;
  if (variant === "chip") {
    const inset = Math.min(bounds.width, bounds.height) * 0.18;
    const fontSize = Math.max(8, Math.min(10, bounds.width / 7));
    return (
      <MachinePart partId={`gpu-${gpu.index}`} label={label} bounds={bounds}>
        <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} rx={3} className="fill-surface-strong" />
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx={3}
          strokeWidth={1.25}
          className={vendorClassNames.body}
        />
        <rect
          x={bounds.x + inset}
          y={bounds.y + inset}
          width={bounds.width - 2 * inset}
          height={bounds.height - 2 * inset}
          rx={2}
          strokeWidth={1}
          className="fill-surface stroke-foreground-faint"
        />
        <text
          x={bounds.x + bounds.width / 2}
          y={bounds.y + bounds.height / 2 - fontSize * 0.6}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={600}
          className={vendorClassNames.text}
        >
          {GPU_VENDOR_NAMES[gpu.vendor]}
        </text>
        <text
          x={bounds.x + bounds.width / 2}
          y={bounds.y + bounds.height / 2 + fontSize * 0.7}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize * 0.9}
          className="fill-foreground-muted"
        >
          GPU {gpu.index}
        </text>
        {live && (
          <LiveBadge x={bounds.x + bounds.width / 2} y={bounds.y + bounds.height} text={live.text} tone={live.tone} />
        )}
      </MachinePart>
    );
  }
  const fanRadius = bounds.height * 0.34;
  const fanCount = bounds.height >= 20 ? (bounds.width > 300 ? 3 : bounds.width > 200 ? 2 : 0) : 0;
  const fontSize = Math.max(8, Math.min(11, bounds.height * 0.32));
  const isNarrow = bounds.width < 240;
  const textWidth =
    bounds.width - fanCount * (2 * fanRadius + 6) - (live && !isNarrow ? live.text.length * 6 + 24 : 0) - 24;
  return (
    <MachinePart partId={`gpu-${gpu.index}`} label={label} bounds={bounds}>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={3}
        strokeWidth={1.25}
        className={vendorClassNames.body}
      />
      <rect
        x={bounds.x}
        y={bounds.y}
        width={5}
        height={bounds.height}
        className={mergeClassNames(vendorClassNames.text, "stroke-none")}
      />
      {Array.from({ length: fanCount }, (_, fanIndex) => {
        const fanCenterX = bounds.x + bounds.width - fanRadius - 8 - fanIndex * (2 * fanRadius + 6);
        return (
          <g key={fanIndex} className="pointer-events-none">
            <circle
              cx={fanCenterX}
              cy={bounds.y + bounds.height / 2}
              r={fanRadius}
              strokeWidth={1}
              className="fill-surface stroke-foreground-faint"
            />
            <circle
              cx={fanCenterX}
              cy={bounds.y + bounds.height / 2}
              r={fanRadius * 0.3}
              className="fill-foreground-faint/40"
            />
          </g>
        );
      })}
      <text
        x={bounds.x + 12}
        y={bounds.y + bounds.height / 2}
        dominantBaseline="central"
        fontSize={fontSize}
        className="pointer-events-none"
      >
        <tspan fontWeight={600} className={vendorClassNames.text}>
          {GPU_VENDOR_NAMES[gpu.vendor]}{" "}
        </tspan>
        <tspan className="fill-foreground">
          {truncateText(gpu.name.replace(/^(NVIDIA|AMD|Intel)\s+/i, ""), Math.max(24, textWidth - 46), fontSize)}
        </tspan>
      </text>
      {live &&
        (isNarrow ? (
          <LiveBadge x={bounds.x + bounds.width / 2} y={bounds.y + bounds.height} text={live.text} tone={live.tone} />
        ) : (
          <LiveBadge
            x={bounds.x + bounds.width - fanCount * (2 * fanRadius + 6) - live.text.length * 3 - 14}
            y={bounds.y + bounds.height / 2}
            text={live.text}
            tone={live.tone}
          />
        ))}
    </MachinePart>
  );
}

function ActivityDot({ x, y, isActive }: { x: number; y: number; isActive: boolean }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={3.5}
      className={mergeClassNames(
        "pointer-events-none",
        isActive ? "fill-success motion-safe:animate-pulse" : "fill-foreground-faint",
      )}
    />
  );
}

function readDiskLabel(device: StorageDevice): string {
  return [
    device.name,
    device.model ?? device.kind.toUpperCase(),
    formatBytes(device.sizeBytes, { maximumFractionDigits: 0 }),
  ].join(" · ");
}

/**
 * An NVMe drive as an M.2 stick with controller and flash chips, its size, and an activity dot.
 *
 * @example
 * <SolidStateStickShape device={disk} bounds={{ x: 430, y: 250, width: 18, height: 80 }} sample={sample} />
 */
export function SolidStateStickShape({
  device,
  bounds,
  sample,
}: {
  device: StorageDevice;
  bounds: PartBounds;
  sample: LiveSystemSample | null;
}) {
  const isVertical = bounds.height > bounds.width;
  const thickness = isVertical ? bounds.width : bounds.height;
  const length = isVertical ? bounds.height : bounds.width;
  const chipRectangle = (offset: number, chipLength: number) =>
    isVertical
      ? { x: bounds.x + thickness * 0.18, y: bounds.y + offset, width: thickness * 0.64, height: chipLength }
      : { x: bounds.x + offset, y: bounds.y + thickness * 0.18, width: chipLength, height: thickness * 0.64 };
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const fontSize = Math.max(7, Math.min(10, thickness * 0.55));
  return (
    <MachinePart partId={`storage-${device.name}`} label={readDiskLabel(device)} bounds={bounds}>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={2}
        strokeWidth={1.25}
        className="fill-pending/15 stroke-pending"
      />
      <rect {...chipRectangle(length * 0.06, length * 0.18)} rx={1} className="fill-foreground-faint/50" />
      <rect {...chipRectangle(length * 0.3, length * 0.26)} rx={1} className="fill-pending/35" />
      <rect {...chipRectangle(length * 0.6, length * 0.26)} rx={1} className="fill-pending/35" />
      {thickness >= 12 && (
        <text
          x={centerX}
          y={centerY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={600}
          transform={isVertical ? `rotate(-90 ${centerX} ${centerY})` : undefined}
          className="pointer-events-none fill-foreground"
        >
          {formatSize(device.sizeBytes)}
        </text>
      )}
      <ActivityDot
        x={isVertical ? centerX : bounds.x + bounds.width - 6}
        y={isVertical ? bounds.y + bounds.height - 6 : centerY}
        isActive={isDiskActive(sample, device.name)}
      />
    </MachinePart>
  );
}

/**
 * A drive bay: a 2.5"/3.5" disk (platter for HDDs, label plate for SSDs), a USB drive (dashed,
 * with a plug), or an empty bay when `device` is null.
 *
 * @example
 * <DriveBayShape device={disk} bounds={{ x: 570, y: 60, width: 180, height: 34 }} sample={sample} />
 */
export function DriveBayShape({
  device,
  bounds,
  sample,
}: {
  device: StorageDevice | null;
  bounds: PartBounds;
  sample: LiveSystemSample | null;
}) {
  if (!device) {
    return (
      <g className="pointer-events-none" aria-hidden="true">
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx={3}
          strokeWidth={1}
          strokeDasharray="4 3"
          className="fill-none stroke-line-strong"
        />
        {bounds.height >= 14 && (
          <text
            x={bounds.x + bounds.width / 2}
            y={bounds.y + bounds.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            letterSpacing={1}
            className="fill-foreground-faint uppercase"
          >
            empty bay
          </text>
        )}
      </g>
    );
  }
  const isExternal = device.kind === "usb";
  const isHardDisk = device.kind === "hdd";
  const isVertical = bounds.height > bounds.width * 1.2;
  const fontSize = Math.max(7.5, Math.min(10.5, (isVertical ? bounds.width * 0.8 : bounds.height) * 0.36));
  const platterRadius = isVertical
    ? Math.min(bounds.width * 0.32, (bounds.height - 40) / 2)
    : Math.min(bounds.width, bounds.height) * 0.36;
  const platterX = isVertical ? bounds.x + bounds.width / 2 : bounds.x + bounds.width - platterRadius - 10;
  const platterY = isVertical ? bounds.y + platterRadius + 8 : bounds.y + bounds.height / 2;
  const hasLabelPlate = !isHardDisk && !isExternal;
  const horizontalTextWidth = isHardDisk
    ? bounds.width - 2 * platterRadius - 30
    : hasLabelPlate
      ? bounds.width * 0.5
      : bounds.width - 20;
  const name = truncateText(
    `${isExternal ? "USB " : ""}${device.model ?? device.name}`,
    isVertical ? bounds.width - 8 : horizontalTextWidth,
    fontSize,
  );
  const sizeText = formatSize(device.sizeBytes);
  const plate = isVertical
    ? { x: bounds.x + bounds.width * 0.15, y: bounds.y + 8, width: bounds.width * 0.7, height: bounds.height * 0.42 }
    : {
        x: bounds.x + bounds.width * 0.55,
        y: bounds.y + bounds.height * 0.22,
        width: bounds.width * 0.38,
        height: bounds.height * 0.56,
      };
  return (
    <MachinePart partId={`storage-${device.name}`} label={readDiskLabel(device)} bounds={bounds}>
      {isExternal && (
        <rect
          x={bounds.x - 8}
          y={bounds.y + bounds.height * 0.3}
          width={8}
          height={bounds.height * 0.4}
          rx={1}
          className="fill-foreground-faint"
        />
      )}
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={3}
        strokeWidth={1.25}
        strokeDasharray={isExternal ? "4 3" : undefined}
        className={
          isExternal ? "fill-surface stroke-foreground-subtle" : "fill-surface-strong stroke-foreground-subtle"
        }
      />
      {isHardDisk && (
        <g className="pointer-events-none">
          <circle
            cx={platterX}
            cy={platterY}
            r={platterRadius}
            strokeWidth={1}
            className="fill-surface stroke-foreground-faint"
          />
          <circle cx={platterX} cy={platterY} r={platterRadius * 0.18} className="fill-foreground-faint" />
          <path
            d={`M${platterX + platterRadius * 0.9} ${platterY + platterRadius * 0.8} L${platterX + platterRadius * 0.15} ${platterY + platterRadius * 0.1}`}
            strokeWidth={2}
            strokeLinecap="round"
            className="stroke-foreground-muted"
          />
        </g>
      )}
      {hasLabelPlate && <rect {...plate} rx={2} className="pointer-events-none fill-surface" />}
      {isVertical ? (
        <text
          x={bounds.x + bounds.width / 2}
          y={bounds.y + bounds.height - 9 - 2 * fontSize}
          textAnchor="middle"
          fontSize={fontSize}
          className="pointer-events-none fill-foreground"
        >
          <tspan x={bounds.x + bounds.width / 2} fontWeight={600}>
            {sizeText}
          </tspan>
          <tspan x={bounds.x + bounds.width / 2} dy={fontSize + 3} className="fill-foreground-muted">
            {truncateText(device.name, bounds.width - 8, fontSize)}
          </tspan>
        </text>
      ) : (
        <text
          x={bounds.x + 10}
          y={bounds.y + bounds.height / 2 - (bounds.height >= 30 ? (fontSize + 3) / 2 : 0)}
          dominantBaseline="central"
          fontSize={fontSize}
          className="pointer-events-none fill-foreground"
        >
          <tspan fontWeight={600}>{name}</tspan>
          {bounds.height >= 30 ? (
            <tspan x={bounds.x + 10} dy={fontSize + 3} className="fill-foreground-muted">
              {sizeText} · {device.name}
            </tspan>
          ) : (
            <tspan className="fill-foreground-muted"> {sizeText}</tspan>
          )}
        </text>
      )}
      <ActivityDot x={bounds.x + bounds.width - 6} y={bounds.y + 6} isActive={isDiskActive(sample, device.name)} />
    </MachinePart>
  );
}

/**
 * A network port on the I/O area: an RJ45 jack, or a Wi-Fi module with antenna arcs. Lit when the link is up.
 *
 * @example
 * <NetworkPortShape adapter={adapter} bounds={{ x: 124, y: 70, width: 22, height: 18 }} />
 */
export function NetworkPortShape({ adapter, bounds }: { adapter: NetworkAdapter; bounds: PartBounds }) {
  const speedText = adapter.speedMegabits === null ? null : formatLinkSpeed(adapter.speedMegabits);
  const label = [
    adapter.interfaceName,
    adapter.isWireless ? "Wi-Fi" : "Ethernet",
    adapter.isUp ? (speedText ?? "up") : "down",
  ].join(" · ");
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const statusClassName = adapter.isUp ? "fill-success" : "fill-foreground-faint";
  if (adapter.isWireless) {
    const arcRadius = Math.min(bounds.width, bounds.height) * 0.42;
    return (
      <MachinePart partId={`network-${adapter.interfaceName}`} label={label} bounds={bounds}>
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx={3}
          strokeWidth={1.25}
          className="fill-surface-strong stroke-foreground-subtle"
        />
        <g
          className={mergeClassNames(
            "pointer-events-none",
            adapter.isUp ? "stroke-success" : "stroke-foreground-faint",
          )}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
        >
          <path
            d={`M${centerX - arcRadius} ${centerY + arcRadius * 0.2} A${arcRadius} ${arcRadius} 0 0 1 ${centerX + arcRadius} ${centerY + arcRadius * 0.2}`}
          />
          <path
            d={`M${centerX - arcRadius * 0.55} ${centerY + arcRadius * 0.45} A${arcRadius * 0.55} ${arcRadius * 0.55} 0 0 1 ${centerX + arcRadius * 0.55} ${centerY + arcRadius * 0.45}`}
          />
        </g>
        <circle
          cx={centerX}
          cy={centerY + arcRadius * 0.7}
          r={1.8}
          className={mergeClassNames("pointer-events-none", statusClassName)}
        />
      </MachinePart>
    );
  }
  return (
    <MachinePart partId={`network-${adapter.interfaceName}`} label={label} bounds={bounds}>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={2}
        strokeWidth={1.25}
        className="fill-surface-strong stroke-foreground-subtle"
      />
      <path
        d={`M${bounds.x + bounds.width * 0.18} ${bounds.y + bounds.height * 0.25} h${bounds.width * 0.64} v${bounds.height * 0.45} h${-bounds.width * 0.18} v${bounds.height * 0.15} h${-bounds.width * 0.28} v${-bounds.height * 0.15} h${-bounds.width * 0.18} Z`}
        className="pointer-events-none fill-foreground-strong/70"
      />
      <rect
        x={bounds.x + 2}
        y={bounds.y + 2}
        width={3}
        height={3}
        className={mergeClassNames("pointer-events-none", statusClassName)}
      />
      <rect
        x={bounds.x + bounds.width - 5}
        y={bounds.y + 2}
        width={3}
        height={3}
        className={mergeClassNames("pointer-events-none", adapter.isUp ? "fill-warning" : "fill-foreground-faint")}
      />
    </MachinePart>
  );
}
