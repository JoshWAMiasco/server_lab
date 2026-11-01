import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { parseUfwConfigurationFiles, parseUfwShowAdded, parseUfwStatusNumbered, parseUfwStatusVerbose } from "./parse-ufw-status";

describe("parseUfwStatusVerbose", () => {
  test("reads status, logging level and default policies", () => {
    expect(parseUfwStatusVerbose(readFixture("ufw-status-verbose-active.txt"))).toEqual({
      status: "active",
      logging: "low",
      defaults: { incoming: "deny", outgoing: "allow", routed: "disabled" },
    });
  });

  test("an inactive firewall has no defaults line", () => {
    expect(parseUfwStatusVerbose(readFixture("ufw-status-inactive.txt"))).toEqual({ status: "inactive", logging: null, defaults: null });
  });

  test("logging off", () => {
    expect(parseUfwStatusVerbose("Status: active\nLogging: off\n").logging).toBe("off");
  });

  test("unrecognised output is unknown", () => {
    expect(parseUfwStatusVerbose("ERROR: You need to be root to run this script").status).toBe("unknown");
  });
});

describe("parseUfwStatusNumbered", () => {
  const rules = parseUfwStatusNumbered(readFixture("ufw-status-numbered-active.txt"));

  test("reads every numbered rule, including two-digit numbers", () => {
    expect(rules.map((rule) => rule.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 10]);
  });

  test("splits to, action and from", () => {
    expect(rules[0]).toEqual({ number: 1, to: "22/tcp", action: "ALLOW IN", from: "Anywhere", comment: null, isIpv6: false, ruleText: "22/tcp ALLOW IN Anywhere" });
    expect(rules[2]).toMatchObject({ to: "8443", action: "DENY IN", from: "192.168.1.0/24" });
  });

  test("reads comments", () => {
    expect(rules[1]).toMatchObject({ to: "Anywhere on tailscale0", comment: "tailnet" });
    expect(rules[3]).toMatchObject({ to: "6000:6007/tcp", action: "LIMIT IN", from: "203.0.113.0/24", comment: "x11 lab" });
  });

  test("handles a To column that overflows its padding", () => {
    expect(rules[6]).toMatchObject({ number: 7, to: "Anywhere (v6) on tailscale0", action: "ALLOW IN", from: "Anywhere (v6)", comment: "tailnet", isIpv6: true });
  });

  test("strips the (out) marker from outgoing rules", () => {
    expect(rules[4]).toMatchObject({ to: "53", action: "ALLOW OUT", from: "Anywhere on eth0", comment: null });
  });

  test("an inactive firewall has no rules", () => {
    expect(parseUfwStatusNumbered(readFixture("ufw-status-inactive.txt"))).toEqual([]);
  });
});

describe("parseUfwShowAdded", () => {
  test("keeps the ufw command lines", () => {
    expect(parseUfwShowAdded("Added user rules (see 'ufw status' for running firewall):\nufw allow 22/tcp\nufw allow in on tailscale0 comment 'tailnet'\n")).toEqual(["ufw allow 22/tcp", "ufw allow in on tailscale0 comment 'tailnet'"]);
    expect(parseUfwShowAdded("(None)\n")).toEqual([]);
  });
});

describe("parseUfwConfigurationFiles", () => {
  const defaultsFile = 'IPV6=yes\nDEFAULT_INPUT_POLICY="DROP"\nDEFAULT_OUTPUT_POLICY="ACCEPT"\nDEFAULT_FORWARD_POLICY="DROP"\n';

  test("reads ENABLED and the default policies", () => {
    expect(parseUfwConfigurationFiles("ENABLED=yes\nLOGLEVEL=low\n", defaultsFile)).toEqual({ status: "active", logging: "low", defaults: { incoming: "deny", outgoing: "allow", routed: "disabled" } });
  });

  test("ENABLED=no means inactive", () => {
    expect(parseUfwConfigurationFiles("# comment\nENABLED=no\nLOGLEVEL=low\n", null)).toEqual({ status: "inactive", logging: "low", defaults: null });
  });
});
