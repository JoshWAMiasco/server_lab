import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { parseSystemctlShow } from "./parse-systemctl-show";

describe("parseSystemctlShow", () => {
  test("reads every unit block with its control group", () => {
    expect(parseSystemctlShow(readFixture("systemctl-show-ubuntu-26.04.txt"))).toEqual([
      { unit: "docker.service", description: "Docker Application Container Engine", state: "running", startedAt: 1_792_915_260_000, mainProcessId: 3379, controlGroup: "/system.slice/docker.service" },
      {
        unit: "postgresql@18-main.service",
        description: "PostgreSQL Cluster 18-main",
        state: "running",
        startedAt: 1_792_915_255_000,
        mainProcessId: 2049,
        controlGroup: "/system.slice/system-postgresql.slice/postgresql@18-main.service",
      },
      { unit: "tailscaled.service", description: "Tailscale node agent", state: "running", startedAt: 1_792_915_254_000, mainProcessId: 2001, controlGroup: "/system.slice/tailscaled.service" },
    ]);
  });

  test("maps states and treats missing values as null", () => {
    const text = ["Id=backup.service", "ActiveState=failed", "ActiveEnterTimestamp=", "MainPID=0", "ControlGroup=", "", "Id=web.service", "ActiveState=activating"].join("\n");
    expect(parseSystemctlShow(text)).toEqual([
      { unit: "backup.service", description: "", state: "failed", startedAt: null, mainProcessId: null, controlGroup: null },
      { unit: "web.service", description: "", state: "starting", startedAt: null, mainProcessId: null, controlGroup: null },
    ]);
  });

  test("keeps an equals sign inside a value", () => {
    expect(parseSystemctlShow("Id=a.service\nDescription=x=y\n")[0]?.description).toBe("x=y");
  });

  test("skips blocks without an Id", () => {
    expect(parseSystemctlShow("Description=orphan\n\n")).toEqual([]);
  });
});
