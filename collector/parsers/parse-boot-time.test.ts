import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { parseBootTime } from "./parse-boot-time";

describe("parseBootTime", () => {
  test("reads btime from /proc/stat as epoch milliseconds", () => {
    const bootTime = parseBootTime(readFixture("proc-stat-ubuntu-24.04.txt"));
    expect(bootTime).toBeGreaterThan(0);
    expect((bootTime ?? 1) % 1000).toBe(0);
    expect(parseBootTime("cpu  1 2 3 4\nbtime 1795135549\nprocesses 12\n")).toBe(1_795_135_549_000);
  });

  test("returns null without a btime line", () => {
    expect(parseBootTime("cpu  1 2 3 4\n")).toBeNull();
    expect(parseBootTime("")).toBeNull();
  });
});
