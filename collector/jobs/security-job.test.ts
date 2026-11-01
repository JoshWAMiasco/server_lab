import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MockSecurity } from "@/collector/drivers/mock/mock-security";
import { createSecurityJob } from "@/collector/jobs/security-job";
import type { ServerLabDatabase } from "@/lib/database/client";
import { readCapability, writeSetting } from "@/lib/database/key-value";
import { hostActionRequests } from "@/lib/schema/security";
import { SECURITY_CAPABILITY_KEY, SECURITY_REFRESH_REQUEST_KEY, type SecurityAction, type SecurityState } from "@/lib/security/security-types";
import { createTemporaryDatabase } from "@/lib/testing/temporary-database";

function createCountingDriver() {
  const security = new MockSecurity();
  const counters = { snapshots: 0, actions: [] as string[] };
  return {
    counters,
    readSecurityState: async () => {
      counters.snapshots += 1;
      return security.readState();
    },
    runSecurityAction: async (requestId: string, action: Exclude<SecurityAction, { kind: "snapshot" }>) => {
      counters.actions.push(action.kind);
      return security.run(requestId, action);
    },
  };
}

describe("createSecurityJob", () => {
  let database: ServerLabDatabase;
  let remove: () => void;
  let clock = 1_000_000;
  beforeEach(() => {
    ({ database, remove } = createTemporaryDatabase());
    clock = 1_000_000;
  });
  afterEach(() => remove());

  const queue = (id: string, action: unknown, status: "pending" | "running" = "pending") =>
    database.insert(hostActionRequests).values({ id, kind: (action as SecurityAction).kind ?? "unknown", action: action as SecurityAction, summary: "test", status, requestedAt: clock }).run();
  const rowOf = (id: string) => database.select().from(hostActionRequests).where(eq(hostActionRequests.id, id)).get();

  test("publishes a snapshot on the first run, then only once a minute", async () => {
    const driver = createCountingDriver();
    const runJob = createSecurityJob(database, driver, { now: () => clock });
    await runJob();
    await runJob();
    expect(driver.counters.snapshots).toBe(1);
    expect(readCapability<SecurityState | null>(database, SECURITY_CAPABILITY_KEY, null)?.fail2ban.jails.map((jail) => jail.name)).toEqual(["sshd", "nginx-http-auth"]);
    clock += 60_000;
    await runJob();
    expect(driver.counters.snapshots).toBe(2);
  });

  test("runs pending requests once, records results, and refreshes the snapshot", async () => {
    const driver = createCountingDriver();
    const runJob = createSecurityJob(database, driver, { now: () => clock });
    await runJob();
    queue("request-0001", { kind: "fail2ban-ban", jail: "sshd", address: "203.0.113.7" });
    queue("request-0002", { kind: "fail2ban-ban", jail: "no-such-jail", address: "203.0.113.7" });
    await runJob();
    await runJob();
    expect(driver.counters.actions).toEqual(["fail2ban-ban", "fail2ban-ban"]);
    expect(rowOf("request-0001")).toMatchObject({ status: "done", result: { isSuccessful: true, steps: [{ commandLine: "sudo fail2ban-client set sshd banip 203.0.113.7" }] } });
    expect(rowOf("request-0002")).toMatchObject({ status: "failed", result: { isSuccessful: false } });
    expect(driver.counters.snapshots).toBe(2);
    expect(readCapability<SecurityState | null>(database, SECURITY_CAPABILITY_KEY, null)?.fail2ban.jails[0]?.bannedAddresses).toContain("203.0.113.7");
  });

  test("refuses invalid stored actions without running them", async () => {
    const driver = createCountingDriver();
    const runJob = createSecurityJob(database, driver, { now: () => clock });
    queue("request-0003", { kind: "fail2ban-ban", jail: "sshd", address: "1.1.1.1; reboot" });
    queue("request-0004", { kind: "snapshot" });
    await runJob();
    expect(driver.counters.actions).toEqual([]);
    expect(rowOf("request-0003")?.status).toBe("failed");
    expect(rowOf("request-0004")?.status).toBe("failed");
  });

  test("marks requests left running by a previous collector as failed", () => {
    queue("request-0005", { kind: "firewall-disable" }, "running");
    createSecurityJob(database, createCountingDriver(), { now: () => clock });
    expect(rowOf("request-0005")).toMatchObject({ status: "failed" });
  });

  test("a refresh request triggers a new snapshot", async () => {
    const driver = createCountingDriver();
    const runJob = createSecurityJob(database, driver, { now: () => clock });
    await runJob();
    clock += 5000;
    writeSetting(database, SECURITY_REFRESH_REQUEST_KEY, clock);
    await runJob();
    expect(driver.counters.snapshots).toBe(2);
  });
});
