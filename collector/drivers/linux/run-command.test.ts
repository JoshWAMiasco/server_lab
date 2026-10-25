import { describe, expect, it } from "vitest";
import { isProgramAvailable, runCommand } from "@/collector/drivers/linux/run-command";

describe("run-command", () => {
  it("finds programs on PATH without a shell", async () => {
    expect(await isProgramAvailable("ls")).toBe(true);
    expect(await isProgramAvailable("definitely-not-a-real-program")).toBe(false);
    expect(await isProgramAvailable("ls; rm -rf /")).toBe(false);
  });

  it("passes arguments verbatim and returns null on failure", async () => {
    expect(await runCommand("echo", ["$(whoami)"])).toBe("$(whoami)\n");
    expect(await runCommand("definitely-not-a-real-program", [])).toBeNull();
  });
});
