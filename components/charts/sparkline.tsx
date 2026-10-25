import { mergeClassNames } from "@/utilities/merge-class-names";

/**
 * A tiny inline SVG trend line (no Chart.js), cheap enough to re-render in every table row.
 *
 * @example
 * <Sparkline values={[3, 5, 4, 8, 6]} className="h-6 w-24 text-brand" />
 */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
  const width = 100;
  const height = 24;
  if (values.length < 2) return <svg viewBox={`0 0 ${width} ${height}`} className={mergeClassNames("h-6 w-24", className)} aria-hidden="true" />;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum || 1;
  const coordinates = values.map((value, valueIndex) => `${((valueIndex / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((value - minimum) / span) * (height - 4)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={mergeClassNames("h-6 w-24", className)} aria-hidden="true">
      <polyline points={`0,${height} ${coordinates.join(" ")} ${width},${height}`} fill="currentColor" fillOpacity="0.12" stroke="none" />
      <polyline points={coordinates.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
