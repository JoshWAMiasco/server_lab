import { describe, expect, test } from "vitest";
import { parseLspciDeviceName } from "./parse-lspci-device";

describe("parseLspciDeviceName", () => {
  test("joins vendor and device", () => {
    expect(parseLspciDeviceName('00:1f.6 "Ethernet controller" "Intel Corporation" "Ethernet Connection (2) I219-LM" -r31 -p00 "Hewlett-Packard Company" "Device 80d5"\n')).toBe(
      "Intel Corporation Ethernet Connection (2) I219-LM",
    );
    expect(parseLspciDeviceName('03:00.0 "VGA compatible controller" "Advanced Micro Devices, Inc. [AMD/ATI]" "Navi 31 [Radeon RX 7900 XT/7900 XTX/7900M]" -rc8 "Sapphire Technology Limited" "Device 471e"')).toBe(
      "Advanced Micro Devices, Inc. [AMD/ATI] Navi 31 [Radeon RX 7900 XT/7900 XTX/7900M]",
    );
  });

  test("returns null for empty or unexpected output", () => {
    expect(parseLspciDeviceName("")).toBeNull();
    expect(parseLspciDeviceName("pcilib: Cannot open /proc/bus/pci")).toBeNull();
  });
});
