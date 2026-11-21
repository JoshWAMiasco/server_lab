import { describe, expect, test } from "vitest";
import { classifyChassisDescription, parseChassisType } from "./parse-chassis-type";

describe("parseChassisType", () => {
  test.each([
    ["3\n", "desktop", "Desktop"],
    ["7", "desktop", "Tower"],
    ["24", "desktop", "Sealed-case PC"],
    ["9", "laptop", "Laptop"],
    ["10\n", "laptop", "Notebook"],
    ["31", "laptop", "Convertible"],
    ["35", "mini", "Mini PC"],
    ["36", "mini", "Stick PC"],
    ["15", "mini", "Space-saving"],
    ["17", "server", "Main Server Chassis"],
    ["23", "server", "Rack Mount Chassis"],
    ["28", "server", "Blade"],
    ["13", "all-in-one", "All In One"],
    ["1", "unknown", "Other"],
    ["2", "unknown", "Unknown"],
    ["34", "unknown", "Embedded PC"],
    ["99", "unknown", null],
  ] as const)("%j → %s (%s)", (text, formFactor, description) => {
    expect(parseChassisType(text)).toMatchObject({ formFactor, description });
  });

  test("ignores the lock-present bit", () => {
    expect(parseChassisType("131")).toEqual({ chassisType: 3, formFactor: "desktop", description: "Desktop" });
  });

  test("unreadable input is unknown", () => {
    expect(parseChassisType(null)).toEqual({ chassisType: null, formFactor: "unknown", description: null });
    expect(parseChassisType("")).toEqual({ chassisType: null, formFactor: "unknown", description: null });
    expect(parseChassisType("0")).toEqual({ chassisType: null, formFactor: "unknown", description: null });
  });
});

describe("classifyChassisDescription", () => {
  test.each([
    ["Notebook", "laptop", 10],
    ["Rack Mount Chassis", "server", 23],
    ["Mini PC", "mini", 35],
    ["space saving", "mini", 15],
  ] as const)("%s → %s", (description, formFactor, chassisType) => {
    expect(classifyChassisDescription(description)).toMatchObject({ formFactor, chassisType });
  });

  test("unknown text is kept as the description", () => {
    expect(classifyChassisDescription("Gaming Cube")).toEqual({ chassisType: null, formFactor: "unknown", description: "Gaming Cube" });
    expect(classifyChassisDescription(null).formFactor).toBe("unknown");
  });
});
