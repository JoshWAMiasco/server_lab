import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { parseUptime } from "./parse-uptime";

describe("parseUptime", () => {
  test("reads seconds since boot", () => {
    expect(parseUptime(readFixture("proc-uptime.txt"))).toBe(1_043_567.21);
  });

  test("returns 0 for unreadable input", () => {
    expect(parseUptime("")).toBe(0);
    expect(parseUptime("n/a")).toBe(0);
  });
});
