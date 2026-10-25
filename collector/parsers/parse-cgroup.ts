/*
 * cgroup files are `key value` lines. memory.stat (v2) reports `inactive_file`; cgroup v1 reports
 * the hierarchical `total_inactive_file`, preferred when present. cpu.stat (v2) reports
 * `usage_usec`. Missing keys read as null.
 */
function parseKeyValueLines(text: string): Map<string, number> {
  const values = new Map<string, number>();
  for (const line of text.split("\n")) {
    const [key, rawValue] = line.trim().split(/\s+/);
    const value = Number(rawValue);
    if (key && rawValue !== undefined && Number.isFinite(value)) {
      values.set(key, value);
    }
  }
  return values;
}

export function parseCgroupMemoryStat(text: string): { inactiveFileBytes: number | null } {
  const values = parseKeyValueLines(text);
  return { inactiveFileBytes: values.get("total_inactive_file") ?? values.get("inactive_file") ?? null };
}

export function parseCgroupCpuStat(text: string): { usageMicroseconds: number | null } {
  return { usageMicroseconds: parseKeyValueLines(text).get("usage_usec") ?? null };
}
