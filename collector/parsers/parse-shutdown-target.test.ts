import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { parsePreviousBootEnd, parseShutdownJobs } from "./parse-shutdown-target";

describe("parseShutdownJobs", () => {
  test.each([
    ["systemctl-list-jobs-reboot.txt", "reboot"],
    ["systemctl-list-jobs-poweroff.txt", "shutdown"],
    ["systemctl-list-jobs-restart.txt", null],
  ] as const)("%s → %s", (fixture, kind) => {
    expect(parseShutdownJobs(readFixture(fixture))).toBe(kind);
  });

  test("kexec and soft-reboot count as reboots, halt as a shutdown", () => {
    expect(parseShutdownJobs("12 kexec.target start waiting\n")).toBe("reboot");
    expect(parseShutdownJobs("12 soft-reboot.target start waiting\n")).toBe("reboot");
    expect(parseShutdownJobs("12 halt.target start waiting\n")).toBe("shutdown");
  });

  test("shutdown.target alone (queued for both) decides nothing", () => {
    expect(parseShutdownJobs("1593 shutdown.target start waiting\n1594 final.target start waiting\n")).toBeNull();
  });

  test("no jobs or no output", () => {
    expect(parseShutdownJobs("")).toBeNull();
    expect(parseShutdownJobs("No jobs running.\n")).toBeNull();
  });
});

describe("parsePreviousBootEnd", () => {
  test.each([
    ["journalctl-previous-boot-reboot.txt", "reboot"],
    ["journalctl-previous-boot-poweroff.txt", "shutdown"],
    ["journalctl-previous-boot-reboot-ubuntu-22.04.txt", "reboot"],
    ["journalctl-previous-boot-crash.txt", null],
  ] as const)("%s → %s", (fixture, kind) => {
    expect(parsePreviousBootEnd(readFixture(fixture))).toBe(kind);
  });

  test("systemd-shutdown's last words alone", () => {
    expect(parsePreviousBootEnd("Syncing filesystems and block devices.\nRebooting.\n")).toBe("reboot");
    expect(parsePreviousBootEnd("Syncing filesystems and block devices.\nPowering off.\n")).toBe("shutdown");
  });

  test("logind's announcement when the journal stopped early", () => {
    expect(parsePreviousBootEnd("System is rebooting.\nStopped target multi-user.target - Multi-User System.\n")).toBe("reboot");
    expect(parsePreviousBootEnd("System is powering down.\nStopping docker.service...\n")).toBe("shutdown");
  });

  test("an empty journal (no previous boot, or no permission) is null", () => {
    expect(parsePreviousBootEnd("")).toBeNull();
    expect(parsePreviousBootEnd("No journal files were opened due to insufficient permissions.\n")).toBeNull();
  });
});
