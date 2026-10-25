import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import { classifyBindAddress, parseSsListeners, widestBindScope } from "./parse-ss-listeners";

describe("parseSsListeners (tcp)", () => {
  const sockets = parseSsListeners(readFixture("ss-tcp-listeners-ubuntu-24.04.txt"), "tcp");

  test("reads every listener", () => {
    expect(sockets).toHaveLength(14);
    expect(sockets.every((socket) => socket.protocol === "tcp")).toBe(true);
  });

  test("strips %interface suffixes", () => {
    expect(sockets[0]).toEqual({ protocol: "tcp", localAddress: "127.0.0.53", port: 53, processName: "systemd-resolve", processId: 812 });
  });

  test("takes the first process when several share the socket", () => {
    expect(sockets[2]).toMatchObject({ localAddress: "0.0.0.0", port: 80, processName: "nginx", processId: 1302 });
    expect(sockets[9]).toMatchObject({ localAddress: "*", port: 22, processName: "sshd", processId: 1001 });
  });

  test("keeps process names containing spaces and parentheses", () => {
    expect(sockets[7]).toMatchObject({ localAddress: "192.168.1.10", port: 32_400, processName: "Plex Media Serv", processId: 1500 });
    expect(sockets[11]).toMatchObject({ localAddress: "::1", port: 3000, processName: "next-server (v1", processId: 3100 });
  });

  test("reports null process for sockets of other users when not run as root", () => {
    expect(sockets[8]).toEqual({ protocol: "tcp", localAddress: "127.0.0.1", port: 631, processName: null, processId: null });
  });

  test("removes brackets from IPv6 and IPv4-mapped addresses", () => {
    expect(sockets[10]).toMatchObject({ localAddress: "::", port: 8096 });
    expect(sockets[12]).toMatchObject({ localAddress: "fd7a:115c:a1e0::1a01:202", port: 8443, processName: "caddy" });
    expect(sockets[13]).toMatchObject({ localAddress: "::ffff:127.0.0.1", port: 9000 });
  });
});

describe("parseSsListeners (udp)", () => {
  const sockets = parseSsListeners(readFixture("ss-udp-listeners-ubuntu-24.04.txt"), "udp");

  test("reads UNCONN sockets as udp", () => {
    expect(sockets).toHaveLength(7);
    expect(sockets.every((socket) => socket.protocol === "udp")).toBe(true);
  });

  test("strips a zone suffix printed after the IPv6 brackets", () => {
    expect(sockets[5]).toMatchObject({ localAddress: "fe80::a00:27ff:fe4e:66a1", port: 546, processName: "systemd-network" });
  });
});

describe("parseSsListeners (combined -tulnpH output)", () => {
  test("takes the protocol from the Netid column", () => {
    const text = [
      "Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process",
      'udp   UNCONN 0      0            0.0.0.0:41641      0.0.0.0:*    users:(("tailscaled",pid=900,fd=12))',
      'tcp   LISTEN 0      4096       127.0.0.1:5432       0.0.0.0:*    users:(("postgres",pid=1450,fd=7))',
    ].join("\n");
    expect(parseSsListeners(text).map((socket) => [socket.protocol, socket.port])).toEqual([
      ["udp", 41_641],
      ["tcp", 5432],
    ]);
  });
});

describe("classifyBindAddress", () => {
  test.each([
    ["127.0.0.1", "local"],
    ["127.0.0.53", "local"],
    ["::1", "local"],
    ["[::1]", "local"],
    ["::ffff:127.0.0.1", "local"],
    ["100.101.1.2", "tailnet"],
    ["100.127.255.254", "tailnet"],
    ["fd7a:115c:a1e0::1a01:202", "tailnet"],
    ["0.0.0.0", "exposed"],
    ["::", "exposed"],
    ["*", "exposed"],
    ["192.168.1.10", "exposed"],
    ["100.128.0.1", "exposed"],
    ["fe80::a00:27ff:fe4e:66a1", "exposed"],
  ] as const)("%s → %s", (address, scope) => {
    expect(classifyBindAddress(address)).toBe(scope);
  });
});

describe("widestBindScope", () => {
  test("picks the most reachable scope", () => {
    expect(widestBindScope(["local", "tailnet"])).toBe("tailnet");
    expect(widestBindScope(["tailnet", "exposed", "local"])).toBe("exposed");
    expect(widestBindScope(["local"])).toBe("local");
  });

  test("is local when there are no listeners", () => {
    expect(widestBindScope([])).toBe("local");
  });
});
