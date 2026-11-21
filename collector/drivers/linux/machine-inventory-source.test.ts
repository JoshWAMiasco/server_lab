import { describe, expect, test } from "vitest";
import { readFixture } from "@/collector/parsers/read-fixture";
import { extractProcessors, parseDmidecode } from "@/collector/parsers/parse-dmidecode";
import { parseLscpu } from "@/collector/parsers/parse-lscpu";
import { buildProcessorInventories, parseEdacMemoryType } from "./machine-inventory-source";

const NO_FALLBACKS = { maximumKilohertz: null, baseKilohertz: null, fallbackModel: null, fallbackLogicalCount: null, architecture: "x86_64" };

describe("buildProcessorInventories", () => {
  test("lscpu plus dmidecode: socket name, base clock from dmidecode, hybrid thread count from CPU(s)", () => {
    const [processor] = buildProcessorInventories({
      ...NO_FALLBACKS,
      lscpu: parseLscpu(readFixture("lscpu-intel-desktop.json")),
      dmidecodeProcessors: [{ socket: "LGA1700", manufacturer: "Intel(R) Corporation", version: "13th Gen Intel(R) Core(TM) i7-13700K", maximumMegahertz: 8300, currentMegahertz: 3400, coreCount: 16, threadCount: 24 }],
    });
    expect(processor).toMatchObject({ socket: "LGA1700", vendor: "Intel", model: "13th Gen Intel(R) Core(TM) i7-13700K", coreCount: 16, threadCount: 24, baseMegahertz: 3400, maximumMegahertz: 5400, virtualization: "VT-x" });
  });

  test("sysfs base_frequency wins over dmidecode; lscpu alone works without the inventory file", () => {
    const [processor] = buildProcessorInventories({ ...NO_FALLBACKS, baseKilohertz: 3_400_000, lscpu: parseLscpu(readFixture("lscpu-amd-hierarchic.json")), dmidecodeProcessors: [] });
    expect(processor).toMatchObject({ socket: null, vendor: "AMD", coreCount: 8, threadCount: 16, baseMegahertz: 3400, maximumMegahertz: 4672 });
  });

  test("two sockets from dmidecode, caches split per socket", () => {
    const lscpu = parseLscpu(
      JSON.stringify({
        lscpu: [
          { field: "Vendor ID:", data: "GenuineIntel" },
          { field: "Model name:", data: "Intel(R) Xeon(R) Gold 6230 CPU @ 2.10GHz" },
          { field: "CPU(s):", data: "80" },
          { field: "Socket(s):", data: "2" },
          { field: "Core(s) per socket:", data: "20" },
          { field: "Thread(s) per core:", data: "2" },
          { field: "L3 cache:", data: "55 MiB (2 instances)" },
        ],
      }),
    );
    const processors = buildProcessorInventories({ ...NO_FALLBACKS, lscpu, dmidecodeProcessors: extractProcessors(parseDmidecode(readFixture("dmidecode-server.txt"))) });
    expect(processors.map((processor) => [processor.socket, processor.coreCount, processor.threadCount])).toEqual([
      ["CPU1", 20, 40],
      ["CPU2", 20, 40],
    ]);
    expect(processors[0]?.caches).toEqual([{ level: "L3", bytes: 27.5 * 1024 * 1024 }]);
  });

  test("no lscpu and no dmidecode: one processor from os.cpus()", () => {
    expect(buildProcessorInventories({ ...NO_FALLBACKS, lscpu: null, dmidecodeProcessors: [], fallbackModel: "Some CPU", fallbackLogicalCount: 4, maximumKilohertz: 3_600_000 })).toEqual([
      { socket: null, vendor: null, model: "Some CPU", architecture: "x86_64", coreCount: null, threadCount: 4, baseMegahertz: null, maximumMegahertz: 3600, caches: [], virtualization: null },
    ]);
  });
});

describe("parseEdacMemoryType", () => {
  test.each([
    ["Registered-DDR4\n", "DDR4", "RDIMM"],
    ["Unbuffered-DDR5", "DDR5", "UDIMM"],
    ["DDR4", "DDR4", null],
    ["Unknown", null, null],
    [null, null, null],
  ])("%j → %s %s", (memoryType, type, formFactor) => {
    expect(parseEdacMemoryType(memoryType)).toEqual({ type, formFactor });
  });
});
