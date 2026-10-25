import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { isPhysicalInterface, parseProcNetDevice } from "./parse-proc-net-dev";

describe("parseProcNetDevice", () => {
  const counters = parseProcNetDevice(readFixture("proc-net-dev-ubuntu-24.04.txt"));

  test("skips the two header lines and reads every interface", () => {
    expect(counters.map((counter) => counter.interfaceName)).toEqual([
      "lo",
      "enp3s0",
      "wlp2s0",
      "docker0",
      "br-3f2a1b4c5d6e",
      "veth8a1b2c3",
      "tailscale0",
      "virbr0",
    ]);
  });

  test("reads receive bytes from column 1 and transmit bytes from column 9", () => {
    expect(counters[1]).toEqual({ interfaceName: "enp3s0", receivedBytes: 152_837_461_234, transmittedBytes: 23_847_123_456 });
  });

  test("handles old kernels that print no space after the colon", () => {
    expect(parseProcNetDevice("  eth0:1234 5 0 0 0 0 0 0 4321 6 0 0 0 0 0 0")).toEqual([
      { interfaceName: "eth0", receivedBytes: 1234, transmittedBytes: 4321 },
    ]);
  });
});

describe("isPhysicalInterface", () => {
  test("excludes loopback, Docker, libvirt and tailscale0 by default", () => {
    const kept = parseProcNetDevice(readFixture("proc-net-dev-ubuntu-24.04.txt"))
      .map((counter) => counter.interfaceName)
      .filter((interfaceName) => isPhysicalInterface(interfaceName));
    expect(kept).toEqual(["enp3s0", "wlp2s0"]);
  });

  test("includes tailscale0 when asked", () => {
    expect(isPhysicalInterface("tailscale0", [], true)).toBe(true);
  });

  test("applies extra exclusions as exact names or prefix patterns", () => {
    expect(isPhysicalInterface("wlp2s0", ["wlp*"])).toBe(false);
    expect(isPhysicalInterface("enp3s0", ["enp3s1"])).toBe(true);
    expect(isPhysicalInterface("enp3s1", ["enp3s1"])).toBe(false);
  });
});
