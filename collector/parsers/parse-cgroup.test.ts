import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { parseCgroupCpuStat, parseCgroupMemoryStat } from "./parse-cgroup";

describe("parseCgroupMemoryStat", () => {
  test("reads inactive_file from cgroup v2", () => {
    expect(parseCgroupMemoryStat(readFixture("cgroup-v2-memory-stat.txt"))).toEqual({ inactiveFileBytes: 912_384_000 });
  });

  test("prefers total_inactive_file from cgroup v1", () => {
    expect(parseCgroupMemoryStat("inactive_file 100\ntotal_inactive_file 250\n")).toEqual({ inactiveFileBytes: 250 });
  });

  test("is null when the key is missing", () => {
    expect(parseCgroupMemoryStat("anon 1\n")).toEqual({ inactiveFileBytes: null });
  });
});

describe("parseCgroupCpuStat", () => {
  test("reads usage_usec", () => {
    expect(parseCgroupCpuStat(readFixture("cgroup-v2-cpu-stat.txt"))).toEqual({ usageMicroseconds: 98_234_123_456 });
  });

  test("is null when the key is missing", () => {
    expect(parseCgroupCpuStat("")).toEqual({ usageMicroseconds: null });
  });
});
