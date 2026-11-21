import { mergeClassNames } from "@/utilities/merge-class-names";

/**
 * A tiny inline SVG trend line (no Chart.js), cheap enough to re-render in every table row. It
 * scales to the values' own minimum and maximum unless `minimumValue` / `maximumValue` pin the
 * scale (for example 0 and 100 for percentages, so a quiet core does not look busy).
 *
 * @example
 * <Sparkline values={[3, 5, 4, 8, 6]} className="h-6 w-24 text-brand" />
 * <Sparkline values={corePercents} minimumValue={0} maximumValue={100} className="h-8 w-full text-success" />
 */
export function Sparkline({ values, minimumValue, maximumValue, className }: { values: readonly number[]; minimumValue?: number; maximumValue?: number; className?: string }) {
  const width = 100;
  const height = 24;
  if (values.length < 2) return <svg viewBox={`0 0 ${width} ${height}`} className={mergeClassNames("h-6 w-24", className)} aria-hidden="true" />;
  const minimum = minimumValue ?? Math.min(...values);
  const maximum = maximumValue ?? Math.max(...values);
  const span = maximum - minimum || 1;
  const coordinates = values.map((value, valueIndex) => {
    const ratio = Math.min(1, Math.max(0, (value - minimum) / span));
    return `${((valueIndex / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ratio * (height - 4)).toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={mergeClassNames("h-6 w-24", className)} aria-hidden="true">
      <polyline points={`0,${height} ${coordinates.join(" ")} ${width},${height}`} fill="currentColor" fillOpacity="0.12" stroke="none" />
      <polyline points={coordinates.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
