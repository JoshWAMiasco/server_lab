import { describe, expect, test } from "vitest";
import { describeGpuPowerState, parsePrimeDiscrete } from "./parse-prime-mode";

describe("parsePrimeDiscrete", () => {
  test("maps /etc/prime-discrete to a mode", () => {
    expect(parsePrimeDiscrete("off\n")).toBe("off");
    expect(parsePrimeDiscrete("on-demand\n")).toBe("on-demand");
    expect(parsePrimeDiscrete("on\n")).toBe("always-on");
  });

  test("is null when the file is missing or unknown", () => {
    expect(parsePrimeDiscrete(null)).toBeNull();
    expect(parsePrimeDiscrete("auto\n")).toBeNull();
  });
});

describe("describeGpuPowerState", () => {
  test("on-demand with the driver loaded is on, nothing pending", () => {
    expect(describeGpuPowerState({ configuredMode: "on-demand", isPrimeSelectAvailable: true, isNvidiaDriverLoaded: true })).toEqual({ isSupported: true, configuredMode: "on-demand", isPoweredOn: true, isRebootPending: false });
  });

  test("switched off but the driver is still loaded: reboot pending", () => {
    expect(describeGpuPowerState({ configuredMode: "off", isPrimeSelectAvailable: true, isNvidiaDriverLoaded: true })).toMatchObject({ isPoweredOn: true, isRebootPending: true });
  });

  test("off after the reboot", () => {
    expect(describeGpuPowerState({ configuredMode: "off", isPrimeSelectAvailable: true, isNvidiaDriverLoaded: false })).toMatchObject({ isPoweredOn: false, isRebootPending: false });
  });

  test("switched back on but not rebooted yet", () => {
    expect(describeGpuPowerState({ configuredMode: "on-demand", isPrimeSelectAvailable: true, isNvidiaDriverLoaded: false })).toMatchObject({ isPoweredOn: false, isRebootPending: true });
  });

  test("unsupported without prime-select or a PRIME profile", () => {
    expect(describeGpuPowerState({ configuredMode: "on-demand", isPrimeSelectAvailable: false, isNvidiaDriverLoaded: true }).isSupported).toBe(false);
    expect(describeGpuPowerState({ configuredMode: null, isPrimeSelectAvailable: true, isNvidiaDriverLoaded: false }).isSupported).toBe(false);
  });
});
