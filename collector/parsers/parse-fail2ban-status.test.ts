import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { parseFail2banJailList, parseFail2banJailStatus, parseFail2banNumber, parseFail2banVersion } from "./parse-fail2ban-status";

describe("parseFail2banJailList", () => {
  test("reads the comma-separated jail list", () => {
    expect(parseFail2banJailList(readFixture("fail2ban-client-status.txt"))).toEqual(["nginx-http-auth", "sshd"]);
  });

  test("drops names that are not plain words", () => {
    expect(parseFail2banJailList("`- Jail list:\tsshd, bad;name, $(reboot)")).toEqual(["sshd"]);
  });

  test("no jail list", () => {
    expect(parseFail2banJailList("ERROR   Failed to access socket path")).toEqual([]);
  });
});

describe("parseFail2banJailStatus", () => {
  test("reads counts and banned IPv4 and IPv6 addresses", () => {
    expect(parseFail2banJailStatus("sshd", readFixture("fail2ban-client-status-sshd.txt"))).toEqual({
      name: "sshd",
      currentlyFailed: 3,
      totalFailed: 148,
      currentlyBanned: 2,
      totalBanned: 17,
      bannedAddresses: ["203.0.113.7", "2001:db8::bad"],
      banTimeSeconds: null,
      findTimeSeconds: null,
      maximumRetries: null,
    });
  });

  test("an empty banned list", () => {
    expect(parseFail2banJailStatus("nginx-http-auth", readFixture("fail2ban-client-status-empty-jail.txt"))).toMatchObject({ currentlyBanned: 0, bannedAddresses: [] });
  });
});

describe("parseFail2banVersion and parseFail2banNumber", () => {
  test.each([
    ["1.1.0\n", "1.1.0"],
    ["Fail2Ban v1.0.2\n", "1.0.2"],
    ["", null],
  ])("version %j", (text, expected) => {
    expect(parseFail2banVersion(text)).toBe(expected);
  });

  test.each([
    ["600\n", 600],
    ["-1\n", -1],
    ["Sorry but the jail 'x' does not exist", null],
  ])("number %j", (text, expected) => {
    expect(parseFail2banNumber(text)).toBe(expected);
  });
});
