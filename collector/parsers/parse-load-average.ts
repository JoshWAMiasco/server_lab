export type LoadAverages = [number, number, number];

function toFiniteNumber(field: string | undefined): number {
  const value = Number(field);
  return Number.isFinite(value) ? value : 0;
}

/* Parses /proc/loadavg (`0.52 0.58 0.59 2/1123 456789`) into the 1, 5 and 15 minute averages. */
export function parseLoadAverage(text: string): LoadAverages {
  const fields = text.trim().split(/\s+/);
  return [toFiniteNumber(fields[0]), toFiniteNumber(fields[1]), toFiniteNumber(fields[2])];
}
