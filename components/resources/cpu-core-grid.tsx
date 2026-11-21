import { Sparkline } from "@/components/charts/sparkline";
import { readUsageTone } from "@/components/resources/metric-tones";
import { mergeClassNames } from "@/utilities/merge-class-names";

export interface CpuCoreReading {
  coreIndex: number;
  /** The trend, oldest first, in percent (0–100). */
  values: readonly number[];
  /** The headline value: the latest reading live, the range average in history. */
  percentage: number | null;
  /** A small line under the value, such as "peak 93%". */
  detail?: string;
}

const TONE_TEXT_CLASS_NAMES = { success: "text-success", warning: "text-warning", danger: "text-danger", slate: "text-foreground-muted" } as const;

/**
 * One small card per CPU core: the core number, its percentage coloured by threshold and a
 * sparkline on a fixed 0–100 scale. Hook-free, so it renders both live (client) and in history
 * (server). Columns grow with the viewport, so 4 cores and 64 cores both lay out cleanly.
 *
 * @example
 * <CpuCoreGrid cores={[{ coreIndex: 0, values: [12, 40, 33], percentage: 33 }]} />
 */
export function CpuCoreGrid({ cores, className }: { cores: readonly CpuCoreReading[]; className?: string }) {
  return (
    <ul aria-label="CPU usage per core" className={mergeClassNames("grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8", className)}>
      {cores.map((core) => {
        const tone = readUsageTone(core.percentage);
        return (
          <li key={core.coreIndex} className="flex min-w-0 flex-col rounded-md border border-line bg-surface-subtle px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-foreground-muted">Core {core.coreIndex}</span>
              <span className={mergeClassNames("font-display text-sm font-medium tabular-nums", TONE_TEXT_CLASS_NAMES[tone])}>{core.percentage === null ? "—" : `${core.percentage.toFixed(0)}%`}</span>
            </div>
            <Sparkline values={core.values} minimumValue={0} maximumValue={100} className={mergeClassNames("mt-1 h-7 w-full", TONE_TEXT_CLASS_NAMES[tone])} />
            {core.detail && <span className="mt-0.5 truncate text-[11px] text-foreground-subtle">{core.detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}
