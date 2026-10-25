import { describe, expect, test } from "vitest";
import { classifyNetworkTag, expandIpv6, normalizeIpAddress, parseIpv4 } from "./classify-ip-address";

describe("classifyNetworkTag", () => {
  test.each([
    ["100.64.0.1", "tailnet"],
    ["100.101.2.3", "tailnet"],
    ["100.127.255.255", "tailnet"],
    ["fd7a:115c:a1e0::1", "tailnet"],
    ["fd7a:115c:a1e0:ab12:4843:cd96:6258:b240", "tailnet"],
    ["::ffff:100.101.2.3", "tailnet"],
    ["10.0.0.5", "lan"],
    ["172.16.0.1", "lan"],
    ["172.31.255.255", "lan"],
    ["192.168.1.20", "lan"],
    ["127.0.0.1", "lan"],
    ["169.254.10.20", "lan"],
    ["::1", "lan"],
    ["fe80::1", "lan"],
    ["febf::1", "lan"],
    ["fd00:1234::5", "lan"],
    ["fc00::1", "lan"],
    ["fd7a:115c:a1e1::1", "lan"],
    ["::ffff:192.168.1.20", "lan"],
    ["::ffff:c0a8:114", "lan"],
    ["[fe80::1%enp3s0]", "lan"],
    ["172.32.0.1", "public"],
    ["100.63.255.255", "public"],
    ["100.128.0.0", "public"],
    ["185.220.101.34", "public"],
    ["8.8.8.8", "public"],
    ["2001:db8:85a3::8a2e:370:7334", "public"],
    ["2a01:4f8:c17:1a2b::1", "public"],
    ["fec0::1", "public"],
    ["::ffff:8.8.8.8", "public"],
    ["not-an-address", "public"],
  ] as const)("%s → %s", (address, tag) => {
    expect(classifyNetworkTag(address)).toBe(tag);
  });
});

describe("address helpers", () => {
  test("normalizeIpAddress strips brackets and zones and unwraps IPv4-mapped IPv6", () => {
    expect(normalizeIpAddress("[::FFFF:10.0.0.1]")).toBe("10.0.0.1");
    expect(normalizeIpAddress("127.0.0.53%lo")).toBe("127.0.0.53");
    expect(normalizeIpAddress("[FE80::1]%eth0")).toBe("fe80::1");
  });

  test("parseIpv4 returns an unsigned 32-bit value", () => {
    expect(parseIpv4("255.255.255.255")).toBe(4_294_967_295);
    expect(parseIpv4("1.2.3")).toBeNull();
  });

  test("expandIpv6 expands compression and embedded IPv4", () => {
    expect(expandIpv6("fd7a:115c:a1e0::1")).toEqual([0xfd_7a, 0x11_5c, 0xa1_e0, 0, 0, 0, 0, 1]);
    expect(expandIpv6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xff_ff, 0x01_02, 0x03_04]);
    expect(expandIpv6("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(expandIpv6("1.2.3.4")).toBeNull();
  });
});
