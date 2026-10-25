import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { computeCorePercents, computeCpuPercent, parseProcStat } from "./parse-proc-stat";

describe("parseProcStat", () => {
  test("sums the first eight columns and treats idle + iowait as not busy", () => {
    const statistics = parseProcStat(readFixture("proc-stat-ubuntu-24.04.txt"));
    expect(statistics.aggregate).toEqual({ busy: 1_957_814, total: 50_238_183 });
    expect(statistics.cores).toHaveLength(4);
    expect(statistics.cores[0]).toEqual({ busy: 384_112 + 612 + 103_201 + 5012, total: 384_112 + 612 + 103_201 + 12_061_234 + 4621 + 5012 });
  });

  test("ignores guest columns, which are already part of user and nice", () => {
    const statistics = parseProcStat("cpu  100 0 50 800 50 0 0 0 999 999\n");
    expect(statistics.aggregate).toEqual({ busy: 150, total: 1000 });
  });

  test("orders cores numerically even when cpu10 precedes cpu2", () => {
    const text = ["cpu 30 0 0 30 0 0 0 0 0 0", "cpu10 10 0 0 10 0 0 0 0 0 0", "cpu2 20 0 0 20 0 0 0 0 0 0"].join("\n");
    expect(parseProcStat(text).cores.map((core) => core.busy)).toEqual([20, 10]);
  });

  test("returns zeros for empty input", () => {
    expect(parseProcStat("")).toEqual({ aggregate: { busy: 0, total: 0 }, cores: [] });
  });
});

describe("computeCpuPercent", () => {
  test("computes the busy share of the elapsed ticks", () => {
    expect(computeCpuPercent({ busy: 100, total: 1000 }, { busy: 175, total: 1100 })).toBe(75);
  });

  test("is 0 when no ticks elapsed or counters went backwards", () => {
    expect(computeCpuPercent({ busy: 100, total: 1000 }, { busy: 100, total: 1000 })).toBe(0);
    expect(computeCpuPercent({ busy: 100, total: 1000 }, { busy: 10, total: 50 })).toBe(0);
  });

  test("clamps to 0-100", () => {
    expect(computeCpuPercent({ busy: 0, total: 0 }, { busy: 200, total: 100 })).toBe(100);
    expect(computeCpuPercent({ busy: 50, total: 0 }, { busy: 0, total: 100 })).toBe(0);
  });

  test("computes per-core percentages and reads 0 for a new core", () => {
    const previous = [{ busy: 0, total: 0 }];
    const current = [
      { busy: 50, total: 100 },
      { busy: 10, total: 20 },
    ];
    expect(computeCorePercents(previous, current)).toEqual([50, 0]);
  });
});
