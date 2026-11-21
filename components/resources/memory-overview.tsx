import type { MemoryInventory, MemoryModule } from "@/collector/types";
import { ProgressBar, type ProgressBarTone } from "@/components/primitives/progress-bar";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/primitives/table";
import { readUsageTone } from "@/components/resources/metric-tones";
import type { LiveSystemSample } from "@/lib/queries/live-types";
import { formatBytes } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

export interface MemoryModuleSummary {
  installedCount: number;
  slotCount: number;
  totalBytes: number;
  /** "4 of 4 slots · 64 GB DDR5 @ 5600 MT/s". */
  text: string;
}

const USAGE_TONE_TO_BAR_TONE = { success: "success", warning: "warning", danger: "danger", slate: "primary" } as const satisfies Record<ReturnType<typeof readUsageTone>, ProgressBarTone>;

function distinct<Value>(values: readonly (Value | null)[]): Value[] {
  return [...new Set(values.filter((value): value is Value => value !== null))];
}

function readModuleSpeed(memoryModule: MemoryModule): number | null {
  return memoryModule.configuredSpeedMegatransfers ?? memoryModule.speedMegatransfers;
}

/**
 * Summarises the detected memory modules, or returns null when there is nothing to summarise (no
 * inventory, source "none", or no modules). Mixed types and speeds are shown as "DDR4/DDR5" and
 * "@ 4800–5600 MT/s".
 *
 * @example
 * summarizeMemoryModules(inventory.memory)?.text; // "4 of 4 slots · 64 GB DDR5 @ 5600 MT/s"
 */
export function summarizeMemoryModules(memory: MemoryInventory | null | undefined): MemoryModuleSummary | null {
  if (!memory || memory.source === "none" || memory.modules.length === 0) return null;
  const installed = memory.modules.filter((memoryModule) => memoryModule.sizeBytes !== null);
  const slotCount = Math.max(memory.slotCount ?? memory.modules.length, installed.length);
  const totalBytes = installed.reduce((total, memoryModule) => total + (memoryModule.sizeBytes ?? 0), 0);
  const types = distinct(installed.map((memoryModule) => memoryModule.type));
  const speeds = distinct(installed.map(readModuleSpeed)).sort((first, second) => first - second);
  const minimumSpeed = speeds[0];
  const maximumSpeed = speeds.at(-1);
  const speedText = minimumSpeed === undefined || maximumSpeed === undefined ? "" : minimumSpeed === maximumSpeed ? ` @ ${minimumSpeed} MT/s` : ` @ ${minimumSpeed}–${maximumSpeed} MT/s`;
  const typeText = types.length > 0 ? ` ${types.join("/")}` : "";
  const text = `${installed.length} of ${slotCount} slot${slotCount === 1 ? "" : "s"} · ${formatBytes(totalBytes, { maximumFractionDigits: 0 })}${typeText}${speedText}`;
  return { installedCount: installed.length, slotCount, totalBytes, text };
}

function UsageRow({ label, value, maximum, detail, tone }: { label: string; value: number; maximum: number; detail: string; tone?: ProgressBarTone }) {
  const percentage = maximum > 0 ? (100 * value) / maximum : null;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-foreground-muted">{label}</span>
        <span className="tabular-nums text-foreground-subtle">{detail}</span>
      </div>
      <ProgressBar value={value} maximum={maximum > 0 ? maximum : 1} size="extra-small" tone={tone ?? USAGE_TONE_TO_BAR_TONE[readUsageTone(percentage)]} />
    </div>
  );
}

const formatGigabytes = (byteCount: number) => formatBytes(byteCount, { maximumFractionDigits: 1 });

/**
 * RAM at a glance: a summary of the installed modules, used / cached / available and swap bars
 * from the latest sample, and a table of every slot (empty ones dimmed). Without a hardware
 * inventory it shows the total from the sample and how to enable module details.
 *
 * @example
 * <MemoryOverview memory={inventory?.memory ?? null} sample={latestSample} />
 */
export function MemoryOverview({ memory, sample, className }: { memory: MemoryInventory | null; sample: LiveSystemSample | null; className?: string }) {
  const summary = summarizeMemoryModules(memory);
  const total = sample?.memoryTotal ?? 0;
  const used = sample?.memoryUsed ?? 0;
  const available = Math.max(0, total - used);
  return (
    <div className={mergeClassNames("flex flex-col gap-4", className)}>
      <div className="font-display text-sm">{summary ? summary.text : `${formatBytes(total, { maximumFractionDigits: 0 })} total`}</div>
      {sample && (
        <div className="flex flex-col gap-3">
          <UsageRow label="Used" value={used} maximum={total} detail={`${formatGigabytes(used)} of ${formatGigabytes(total)}`} />
          <UsageRow label="Cached" value={Math.min(sample.memoryCached, total)} maximum={total} detail={formatGigabytes(sample.memoryCached)} tone="pending" />
          <UsageRow label="Available" value={available} maximum={total} detail={formatGigabytes(available)} tone="primary" />
          {sample.swapTotal > 0 ? <UsageRow label="Swap" value={sample.swapUsed} maximum={sample.swapTotal} detail={`${formatGigabytes(sample.swapUsed)} of ${formatGigabytes(sample.swapTotal)}`} /> : <div className="text-xs text-foreground-subtle">No swap configured.</div>}
        </div>
      )}
      {summary && memory ? (
        <div className="-mx-5 overflow-x-auto">
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
              </TableRow>
            </TableHead>
            <TableBody>
              {memory.modules.map((memoryModule, moduleIndex) => {
                const isEmpty = memoryModule.sizeBytes === null;
                const speed = readModuleSpeed(memoryModule);
                return (
                  <TableRow key={`${memoryModule.slot}-${moduleIndex}`} className={mergeClassNames(isEmpty && "text-foreground-subtle opacity-60")}>
                    <TableCell className="font-medium">{memoryModule.slot}</TableCell>
                    {isEmpty ? (
                      <TableCell colSpan={6} className="italic">
                        Empty
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="tabular-nums">{formatBytes(memoryModule.sizeBytes ?? 0, { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell>{memoryModule.type ?? "—"}</TableCell>
                        <TableCell>{memoryModule.formFactor ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{speed === null ? "—" : `${speed} MT/s`}</TableCell>
                        <TableCell>{memoryModule.manufacturer ?? "—"}</TableCell>
                        <TableCell className="font-mono">{memoryModule.partNumber ?? "—"}</TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-xs text-foreground-muted">Module details unavailable — run deploy/install.sh to enable the hardware inventory unit.</p>
      )}
    </div>
  );
}
