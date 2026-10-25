import Link from "next/link";
import { mergeClassNames } from "@/utilities/merge-class-names";

const LIVE_OPTIONS = ["5m", "15m", "1h"] as const;
const HISTORY_OPTIONS = ["24h", "7d", "30d"] as const;

/**
 * The `[5m][15m][1h] | [24h][7d][30d]` switch: live windows on the left, rollup history on the right.
 *
 * @example
 * <RangeSwitcher currentRange="5m" basePath="/resources" />
 */
export function RangeSwitcher({ currentRange, basePath, liveOptions = LIVE_OPTIONS, historyOptions = HISTORY_OPTIONS }: { currentRange: string; basePath: string; liveOptions?: readonly string[]; historyOptions?: readonly string[] }) {
  const renderOption = (option: string) => (
    <Link key={option} href={`${basePath}?range=${option}`} scroll={false} aria-current={option === currentRange ? "page" : undefined} className={mergeClassNames("px-3 py-1.5 font-display text-xs tracking-[0.08em] uppercase transition-colors", option === currentRange ? "bg-brand text-on-primary" : "text-foreground-muted hover:text-foreground")}>
      {option}
    </Link>
  );
  return (
    <div className="flex items-center border border-line bg-surface p-0.5">
      {liveOptions.length > 0 && (
        <>
          <span className="flex items-center gap-1.5 px-2 text-[10px] text-success uppercase">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            live
          </span>
          {liveOptions.map(renderOption)}
          <span className="mx-1.5 h-5 w-px bg-line-strong" />
        </>
      )}
      {historyOptions.map(renderOption)}
    </div>
  );
}
