import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { parseLastOutput } from "./parse-last-output";

/* last prints local time without an offset; the parser reads it in this process's time zone. */
function localTime(year: number, month: number, day: number, hours: number, minutes: number, seconds: number): number {
  return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
}

describe("parseLastOutput (wtmp)", () => {
  const events = parseLastOutput(readFixture("last-ubuntu-24.04.txt"), false);

  test("skips reboot, shutdown and the wtmp footer", () => {
    expect(events.map((event) => event.username)).toEqual(["joshua", "joshua", "joshua", "joshua", "deploy"]);
  });

  test("parses a still-logged-in ssh session", () => {
    expect(events[0]).toEqual({
      timestamp: localTime(2026, 10, 18, 14, 2, 11),
      channel: "ssh",
      username: "joshua",
      result: "success",
      method: "unknown",
      sourceAddress: "100.101.2.3",
      sourcePort: null,
      raw: "joshua   pts/0        100.101.2.3      Sat Oct 18 14:02:11 2026   still logged in",
    });
  });

  test("treats tty logins from 0.0.0.0 as console with no address", () => {
    expect(events[2]).toMatchObject({ channel: "console", sourceAddress: null, timestamp: localTime(2026, 10, 16, 8, 0, 1) });
  });

  test("keeps IPv6 hosts and pads single-digit days", () => {
    expect(events[3]).toMatchObject({ sourceAddress: "2001:db8:85a3::8a2e:370:7334", channel: "ssh" });
    expect(events[4]).toMatchObject({ username: "deploy", channel: "ssh", sourceAddress: null, timestamp: localTime(2026, 10, 1, 6, 30, 0) });
  });
});

describe("parseLastOutput (btmp)", () => {
  const events = parseLastOutput(readFixture("lastb-ubuntu-24.04.txt"), true);

  test("marks every row as a failure and skips the btmp footer", () => {
    expect(events).toHaveLength(4);
    expect(events.every((event) => event.result === "failure")).toBe(true);
  });

  test("reads ssh:notty as ssh and tty1 as console", () => {
    expect(events[0]).toMatchObject({ username: "admin", channel: "ssh", sourceAddress: "185.220.101.34" });
    expect(events[2]).toMatchObject({ username: "ubuntu", sourceAddress: "2a01:4f8:c17:1a2b::1" });
    expect(events[3]).toMatchObject({ username: "joshua", channel: "console", sourceAddress: null });
  });

  test("returns nothing for empty output", () => {
    expect(parseLastOutput("", true)).toEqual([]);
  });
});
