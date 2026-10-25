import { CatalogIcon } from "@/components/lobby/catalog-icon";
import { SourceBadge } from "@/components/lobby/source-badge";
import { Sparkline } from "@/components/charts/sparkline";
import type { AppIdentity } from "@/lib/queries/app-usage-queries";
import type { LiveAppUsage } from "@/lib/queries/live-types";
import { formatBytes } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

/**
 * The bar tone: brand by default; warning above 80 % and danger above 95 % of the app's own
 * memory limit, when it has one.
 *
 * @example
 * readLimitTone({ memoryBytes: 900, memoryLimitBytes: 1000 }); // "warning"
 */
export function readLimitTone(usage: Pick<LiveAppUsage, "memoryBytes" | "memoryLimitBytes">): "brand" | "warning" | "danger" {
  if (!usage.memoryLimitBytes) return "brand";
  const ratio = usage.memoryBytes / usage.memoryLimitBytes;
  if (ratio > 0.95) return "danger";
  if (ratio > 0.8) return "warning";
  return "brand";
}

const BAR_TONE_CLASS_NAMES = { brand: "bg-brand", warning: "bg-warning", danger: "bg-danger" } as const;

/**
 * One ranked row: rank, icon and name, a bar sized by % of host memory with the actual size, CPU %
 * and a 15-minute memory sparkline.
 *
 * @example
 * <AppUsageRow rank={1} usage={usage} identity={identity} hostMemoryTotal={34359738368} sparklineValues={values} isSelected={false} onSelect={select} />
 */
export function AppUsageRow({ rank, usage, identity, hostMemoryTotal, sparklineValues, isSelected, onSelect }: { rank: number; usage: LiveAppUsage; identity: AppIdentity; hostMemoryTotal: number; sparklineValues: readonly number[]; isSelected: boolean; onSelect: () => void }) {
  const memoryPercentage = hostMemoryTotal > 0 ? (100 * usage.memoryBytes) / hostMemoryTotal : 0;
  const tone = readLimitTone(usage);
  return (
    <button type="button" onClick={onSelect} id={usage.appKey} className={mergeClassNames("grid w-full cursor-pointer grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-dashed border-line-strong/70 px-5 py-3.5 text-left transition-colors hover:bg-surface-muted/60 md:grid-cols-[2rem_minmax(0,14rem)_minmax(0,1fr)_5.5rem_6.5rem]", isSelected && "bg-brand/5 outline outline-brand/50")}>
      <div className="font-display text-lg text-foreground-subtle">{rank}</div>
      <div className="flex min-w-0 items-center gap-3">
        <CatalogIcon iconFileName={identity.iconFileName} name={identity.name} className="h-8 w-8" />
        <div className="min-w-0">
          <div className="truncate font-medium">{identity.name}</div>
          <div className="mt-0.5 scale-90 origin-left">
            <SourceBadge source={identity.source} />
          </div>
        </div>
      </div>
      <div className="col-span-2 md:col-span-1">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-display text-sm font-medium">{formatBytes(usage.memoryBytes)}</span>
          <span className="text-foreground-muted">
            {memoryPercentage.toFixed(1)}% of host{usage.memoryLimitBytes ? ` · limit ${formatBytes(usage.memoryLimitBytes, { maximumFractionDigits: 1 })}` : ""}
          </span>
        </div>
        <div className="mt-1.5 h-2.5 w-full bg-surface-strong">
          <div className={mergeClassNames("h-full transition-[width] duration-700", BAR_TONE_CLASS_NAMES[tone])} style={{ width: `${Math.min(100, memoryPercentage)}%` }} />
        </div>
      </div>
      <div className="hidden text-right md:block">
        <div className="text-xs text-foreground-subtle">CPU</div>
        <div className="font-display">{usage.cpuPercent.toFixed(1)}%</div>
      </div>
      <Sparkline values={sparklineValues} className="hidden h-7 w-26 text-brand md:block" />
    </button>
  );
}
