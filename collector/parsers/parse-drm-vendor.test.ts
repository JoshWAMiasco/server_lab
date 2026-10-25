import { describe, expect, test } from "vitest";
import { parseDrmVendor } from "./parse-drm-vendor";

describe("parseDrmVendor", () => {
  test.each([
    ["0x10de\n", "nvidia"],
    ["0x1002\n", "amd"],
    ["0x8086\n", "intel"],
    ["0x10DE", "nvidia"],
    ["8086", "intel"],
    ["0x1af4\n", null],
    ["", null],
  ] as const)("%j → %s", (text, vendor) => {
    expect(parseDrmVendor(text)).toBe(vendor);
  });
});
