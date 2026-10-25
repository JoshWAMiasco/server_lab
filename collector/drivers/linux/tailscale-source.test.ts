import { describe, expect, test } from "vitest";
import { readPeerApiPorts } from "./tailscale-source";

describe("readPeerApiPorts", () => {
  test("reads the PeerAPI port for each Tailscale address", () => {
    const status = { Self: { PeerAPIURL: ["http://100.64.0.7:64261", "http://[fd7a:115c:a1e0::7]:50549"] } };
    expect(readPeerApiPorts(status)).toEqual([64_261, 50_549]);
  });

  test("is empty without Tailscale or PeerAPI", () => {
    expect(readPeerApiPorts(null)).toEqual([]);
    expect(readPeerApiPorts({ Self: {} })).toEqual([]);
  });

  test("skips malformed URLs", () => {
    expect(readPeerApiPorts({ Self: { PeerAPIURL: ["not a url", "http://100.64.0.7", "http://100.64.0.7:41641"] } })).toEqual([41_641]);
  });
});
