import type { CpuTimes, ProcessorStatistics } from "../types";

/*
 * /proc/stat cpu lines hold, in USER_HZ ticks: user nice system idle iowait irq softirq steal guest
 * guest_nice. The kernel already counts guest and guest_nice inside user and nice, so only the
 * first eight columns are summed. Busy time is the total minus idle and iowait.
 */
const COUNTED_COLUMN_COUNT = 8;
const IDLE_COLUMN = 3;
const IOWAIT_COLUMN = 4;
const CORE_LABEL = /^cpu(\d+)$/;

function parseCpuFields(fields: string[]): CpuTimes {
  const values = fields.slice(1, 1 + COUNTED_COLUMN_COUNT).map((field) => {
    const value = Number(field);
    return Number.isFinite(value) ? value : 0;
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  const idle = (values[IDLE_COLUMN] ?? 0) + (values[IOWAIT_COLUMN] ?? 0);
  return { busy: total - idle, total };
}

/* Cores are returned in ascending cpuN order; offline CPUs are absent from /proc/stat and from the result. */
export function parseProcStat(text: string): ProcessorStatistics {
  let aggregate: CpuTimes = { busy: 0, total: 0 };
  const cores: { coreNumber: number; times: CpuTimes }[] = [];
  for (const line of text.split("\n")) {
    const fields = line.trim().split(/\s+/);
    const label = fields[0] ?? "";
    if (label === "cpu") {
      aggregate = parseCpuFields(fields);
      continue;
    }
    const coreMatch = CORE_LABEL.exec(label);
    if (coreMatch) {
      cores.push({ coreNumber: Number(coreMatch[1]), times: parseCpuFields(fields) });
    }
  }
  cores.sort((left, right) => left.coreNumber - right.coreNumber);
  return { aggregate, cores: cores.map((core) => core.times) };
}

/* Busy share of the ticks elapsed between two readings, clamped to 0–100. Returns 0 when no time elapsed. */
export function computeCpuPercent(previous: CpuTimes, current: CpuTimes): number {
  const totalDelta = current.total - previous.total;
  if (!(totalDelta > 0)) {
    return 0;
  }
  const percent = ((current.busy - previous.busy) / totalDelta) * 100;
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.min(100, Math.max(0, percent));
}

/* Per-core percentages; a core missing from the previous reading (CPU just came online) reads 0. */
export function computeCorePercents(previousCores: CpuTimes[], currentCores: CpuTimes[]): number[] {
  return currentCores.map((current, coreIndex) => {
    const previous = previousCores[coreIndex];
    return previous ? computeCpuPercent(previous, current) : 0;
  });
}
