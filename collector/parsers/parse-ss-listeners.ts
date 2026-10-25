import type { BindScope, ListeningSocket } from "../types";
import { isLoopbackAddress, isTailnetAddress, stripAddressDecorations } from "./classify-ip-address";

/*
 * Parses `ss -tlnpH` / `ss -ulnpH` output. Columns: State Recv-Q Send-Q Local:Port Peer:Port
 * [users:((…))], with an extra leading Netid column when tcp and udp are queried together
 * (`ss -tulnpH`), which then overrides the `protocol` argument. The users field is missing when ss
 * runs without root and the socket belongs to another user; process name and PID are then null.
 * When several processes share a socket (nginx workers, sshd plus systemd socket activation) the
 * first one listed is used.
 */
const USERS_FIELD = /users:\(\("((?:[^"\\]|\\.)*)",pid=(\d+)/;
const HEADER_LABELS = new Set(["State", "Netid"]);

function splitEndpoint(field: string): { localAddress: string; port: number } | null {
  const colonIndex = field.lastIndexOf(":");
  if (colonIndex <= 0) {
    return null;
  }
  const port = Number(field.slice(colonIndex + 1));
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    return null;
  }
  return { localAddress: stripAddressDecorations(field.slice(0, colonIndex)), port };
}

export function parseSsListeners(text: string, protocol: "tcp" | "udp" = "tcp"): ListeningSocket[] {
  const sockets: ListeningSocket[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const fields = line.split(/\s+/);
    const firstField = fields[0] ?? "";
    if (!line || HEADER_LABELS.has(firstField)) {
      continue;
    }
    const hasNetidColumn = firstField === "tcp" || firstField === "udp";
    const endpoint = splitEndpoint(fields[hasNetidColumn ? 4 : 3] ?? "");
    if (!endpoint) {
      continue;
    }
    const users = USERS_FIELD.exec(line);
    sockets.push({
      protocol: hasNetidColumn ? (firstField as "tcp" | "udp") : protocol,
      localAddress: endpoint.localAddress,
      port: endpoint.port,
      processName: users?.[1] ?? null,
      processId: users?.[2] ? Number(users[2]) : null,
    });
  }
  return sockets;
}

/*
 * Who can reach a listener: loopback (127.0.0.0/8, ::1) is `local`; a Tailscale address
 * (100.64.0.0/10, fd7a:115c:a1e0::/48) is `tailnet`; everything else, including the wildcards
 * `0.0.0.0`, `::` and `*` and any LAN address, is `exposed`.
 */
export function classifyBindAddress(address: string): BindScope {
  if (isLoopbackAddress(address)) {
    return "local";
  }
  if (isTailnetAddress(address)) {
    return "tailnet";
  }
  return "exposed";
}

const BIND_SCOPE_RANK: Record<BindScope, number> = { local: 0, tailnet: 1, exposed: 2 };

/* The most reachable scope among an item's listeners; `local` when there are none. */
export function widestBindScope(scopes: Iterable<BindScope>): BindScope {
  let widest: BindScope = "local";
  for (const scope of scopes) {
    if (BIND_SCOPE_RANK[scope] > BIND_SCOPE_RANK[widest]) {
      widest = scope;
    }
  }
  return widest;
}
