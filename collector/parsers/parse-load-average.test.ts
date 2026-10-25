import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { parseLoadAverage } from "./parse-load-average";

describe("parseLoadAverage", () => {
  test("reads the 1, 5 and 15 minute averages", () => {
    expect(parseLoadAverage(readFixture("proc-loadavg.txt"))).toEqual([0.52, 0.58, 0.59]);
  });

  test("returns zeros for unreadable input", () => {
    expect(parseLoadAverage("")).toEqual([0, 0, 0]);
    expect(parseLoadAverage("garbage")).toEqual([0, 0, 0]);
  });
});
