import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { cleanDmidecodeValue, extractMemoryArray, extractMemoryModules, extractProcessors, extractSystemInformation, parseDmidecode, parseDmidecodeSizeBytes, parseDmidecodeSpeed } from "./parse-dmidecode";

const GIBIBYTE = 1024 ** 3;

describe("parseDmidecode", () => {
  const handles = parseDmidecode(readFixture("dmidecode-desktop.txt"));

  test("reads one handle per block with its type and name", () => {
    expect(handles.map((handle) => handle.type)).toEqual([0, 1, 2, 3, 4, 16, 17, 17, 17, 17, 127]);
    expect(handles[0]).toMatchObject({ handle: "0x0000", name: "BIOS Information" });
    expect(handles.at(-1)?.name).toBe("End Of Table");
  });

  test("keeps properties and list properties apart", () => {
    const bios = handles[0];
    if (!bios) throw new Error("no BIOS handle");
    expect(bios.properties.get("Version")).toBe("1662");
    expect(bios.properties.get("BIOS Revision")).toBe("5.27");
    expect(bios.listProperties.get("Characteristics")).toContain("UEFI is supported");
    expect(bios.properties.has("Characteristics")).toBe(false);
  });

  test("ignores the preamble and empty input", () => {
    expect(parseDmidecode("# dmidecode 3.5\nPermission denied\n")).toEqual([]);
    expect(parseDmidecode("")).toEqual([]);
  });
});

describe("extractMemoryModules", () => {
  test("desktop: 2 of 4 DDR5 slots filled, filled slots first", () => {
    const modules = extractMemoryModules(parseDmidecode(readFixture("dmidecode-desktop.txt")));
    expect(modules).toHaveLength(4);
    expect(modules[0]).toEqual({
      slot: "DIMM 1",
      bank: "P0 CHANNEL A",
      sizeBytes: 16 * GIBIBYTE,
      type: "DDR5",
      formFactor: "DIMM",
      speedMegatransfers: 5600,
      configuredSpeedMegatransfers: 4800,
      manufacturer: "Kingston",
      partNumber: "KF556C40-16",
      serialNumber: "A1B2C3D4",
    });
    expect(modules.slice(2)).toEqual([
      expect.objectContaining({ slot: "DIMM 0", bank: "P0 CHANNEL A", sizeBytes: null, type: null, speedMegatransfers: null, manufacturer: null, partNumber: null }),
      expect.objectContaining({ slot: "DIMM 0", bank: "P0 CHANNEL B", sizeBytes: null }),
    ]);
  });

  test("laptop: soldered memory plus a SODIMM, JEDEC manufacturer code resolved, zero serial dropped", () => {
    const modules = extractMemoryModules(parseDmidecode(readFixture("dmidecode-laptop.txt")));
    expect(modules).toHaveLength(2);
    expect(modules[0]).toMatchObject({ slot: "Controller0-ChannelA-DIMM0", sizeBytes: 8 * GIBIBYTE, formFactor: "Row Of Chips", type: "DDR4", manufacturer: "Samsung", serialNumber: null });
    expect(modules[1]).toMatchObject({ formFactor: "SODIMM", sizeBytes: 16 * GIBIBYTE, manufacturer: "SK Hynix", partNumber: "HMAA2GS6CJR8N-XN" });
  });

  test("mini PC: sizes in MB and speeds in MHz", () => {
    const modules = extractMemoryModules(parseDmidecode(readFixture("dmidecode-mini.txt")));
    expect(modules.map((module) => [module.sizeBytes, module.speedMegatransfers, module.configuredSpeedMegatransfers, module.formFactor])).toEqual([
      [8 * GIBIBYTE, 3200, 3200, "SODIMM"],
      [8 * GIBIBYTE, 3200, 3200, "SODIMM"],
    ]);
  });

  test("server: 24 slots across two sockets, 8 filled with ECC RDIMMs", () => {
    const modules = extractMemoryModules(parseDmidecode(readFixture("dmidecode-server.txt")));
    expect(modules).toHaveLength(24);
    const filled = modules.filter((module) => module.sizeBytes !== null);
    expect(filled.map((module) => module.slot)).toEqual(["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]);
    expect(filled[0]).toMatchObject({ bank: null, manufacturer: "SK Hynix", speedMegatransfers: 2933, sizeBytes: 32 * GIBIBYTE });
  });

  test("skips memory devices that belong to a non-system array", () => {
    const text = [
      "Handle 0x0001, DMI type 16, 23 bytes",
      "Physical Memory Array",
      "\tUse: Flash Memory",
      "\tNumber Of Devices: 1",
      "",
      "Handle 0x0002, DMI type 16, 23 bytes",
      "Physical Memory Array",
      "\tUse: System Memory",
      "\tNumber Of Devices: 1",
      "",
      "Handle 0x0003, DMI type 17, 40 bytes",
      "Memory Device",
      "\tArray Handle: 0x0001",
      "\tSize: 4 MB",
      "\tLocator: SYSTEM ROM",
      "",
      "Handle 0x0004, DMI type 17, 40 bytes",
      "Memory Device",
      "\tArray Handle: 0x0002",
      "\tSize: 8 GB",
      "\tLocator: DIMM1",
    ].join("\n");
    const handles = parseDmidecode(text);
    expect(extractMemoryModules(handles).map((module) => module.slot)).toEqual(["DIMM1"]);
    expect(extractMemoryArray(handles).slotCount).toBe(1);
  });
});

describe("extractMemoryArray", () => {
  test.each([
    ["dmidecode-desktop.txt", 4, 128 * GIBIBYTE, null],
    ["dmidecode-laptop.txt", 2, 64 * GIBIBYTE, null],
    ["dmidecode-mini.txt", 2, 64 * GIBIBYTE, null],
    ["dmidecode-server.txt", 24, 3072 * GIBIBYTE, "Multi-bit ECC"],
  ])("%s", (fixture, slotCount, maximumCapacityBytes, errorCorrection) => {
    expect(extractMemoryArray(parseDmidecode(readFixture(fixture)))).toEqual({ slotCount, maximumCapacityBytes, errorCorrection });
  });

  test("returns nulls without a type-16 array", () => {
    expect(extractMemoryArray([])).toEqual({ slotCount: null, maximumCapacityBytes: null, errorCorrection: null });
  });
});

describe("extractSystemInformation", () => {
  test("desktop: placeholder system strings become null, the board is real", () => {
    const information = extractSystemInformation(parseDmidecode(readFixture("dmidecode-desktop.txt")));
    expect(information.system).toEqual({ vendor: "ASUS", product: null, version: null, serialNumber: null });
    expect(information.motherboard).toEqual({ vendor: "ASUSTeK COMPUTER INC.", model: "ROG STRIX B650E-F GAMING WIFI", version: "Rev 1.xx", serialNumber: "231012345678901" });
    expect(information.bios).toEqual({ vendor: "American Megatrends International, LLC.", version: "1662", releaseDate: "03/28/2024" });
    expect(information.chassis).toEqual({ vendor: null, typeDescription: "Desktop", serialNumber: null });
  });

  test("server", () => {
    const information = extractSystemInformation(parseDmidecode(readFixture("dmidecode-server.txt")));
    expect(information.system).toMatchObject({ vendor: "Dell Inc.", product: "PowerEdge R740", version: null, serialNumber: "8ABCD12" });
    expect(information.chassis.typeDescription).toBe("Rack Mount Chassis");
  });
});

describe("extractProcessors", () => {
  test("one entry per populated socket", () => {
    const processors = extractProcessors(parseDmidecode(readFixture("dmidecode-server.txt")));
    expect(processors).toHaveLength(2);
    expect(processors[1]).toEqual({ socket: "CPU2", manufacturer: "Intel", version: "Intel(R) Xeon(R) Gold 6230 CPU @ 2.10GHz", maximumMegahertz: 4000, currentMegahertz: 2100, coreCount: 20, threadCount: 40 });
  });

  test("desktop socket and clocks", () => {
    expect(extractProcessors(parseDmidecode(readFixture("dmidecode-desktop.txt")))).toEqual([
      { socket: "AM5", manufacturer: "Advanced Micro Devices, Inc.", version: "AMD Ryzen 9 7950X 16-Core Processor", maximumMegahertz: 5850, currentMegahertz: 4500, coreCount: 16, threadCount: 32 },
    ]);
  });

  test("skips unpopulated sockets", () => {
    const text = "Handle 0x0400, DMI type 4, 48 bytes\nProcessor Information\n\tSocket Designation: CPU2\n\tStatus: Unpopulated\n";
    expect(extractProcessors(parseDmidecode(text))).toEqual([]);
  });
});

describe("value helpers", () => {
  test.each([
    ["To Be Filled By O.E.M.", null],
    ["Not Specified", null],
    ["Default string", null],
    ["00000000", null],
    ["FFFFFFFF", null],
    ["  Kingston ", "Kingston"],
  ])("cleanDmidecodeValue(%j) → %j", (value, expected) => {
    expect(cleanDmidecodeValue(value)).toBe(expected);
  });

  test.each([
    ["16 GB", 16 * GIBIBYTE],
    ["8192 MB", 8 * GIBIBYTE],
    ["2 TB", 2048 * GIBIBYTE],
    ["No Module Installed", null],
    ["0 MB", null],
    [undefined, null],
  ])("parseDmidecodeSizeBytes(%j) → %j", (value, expected) => {
    expect(parseDmidecodeSizeBytes(value)).toBe(expected);
  });

  test.each([
    ["5600 MT/s", 5600],
    ["2400 MHz", 2400],
    ["Unknown", null],
  ])("parseDmidecodeSpeed(%j) → %j", (value, expected) => {
    expect(parseDmidecodeSpeed(value)).toBe(expected);
  });
});
