import { readTextFile, runCommand } from "@/collector/drivers/linux/run-command";
import { classifyBindAddress, parseSsListeners, widestBindScope } from "@/collector/parsers/parse-ss-listeners";
import type { DiscoveredItem, ListeningSocket } from "@/collector/types";

export type ListenerOwner = { kind: "docker" } | { kind: "unit"; unit: string } | { kind: "process"; processId: number | null; processName: string | null } | { kind: "ignored" };

const IGNORED_PROCESS_NAMES = new Set(["sshd", "systemd-resolve", "systemd-resolved", "dnsmasq", "rpcbind", "cupsd", "chronyd", "systemd"]);
const DOCKER_PROCESS_NAMES = new Set(["docker-proxy", "containerd", "dockerd", "rootlesskit"]);

/**
 * Every TCP listener (`ss -tlnpH`). As a non-root user `ss` only names processes the collector
 * owns, so most listeners have `processId: null`; the caller matches those by port instead.
 */
export async function readListeners(): Promise<ListeningSocket[]> {
  return parseSsListeners((await runCommand("ss", ["-tlnpH"])) ?? "", "tcp");
}

async function readUnitOfProcess(processId: number): Promise<string | null | "docker"> {
  const cgroupText = await readTextFile(`/proc/${processId}/cgroup`);
  if (!cgroupText) return null;
  if (/docker[-/]|\/containerd|libpod/.test(cgroupText)) return "docker";
  return /\/([^/\n]+\.service)\b/.exec(cgroupText)?.[1] ?? null;
}

/**
 * Decides who owns a listener: a container (skipped, Docker reports its ports), a systemd unit,
 * a bare process (becomes a `port:` item) or nothing worth showing (ssh, DNS stub, ServerLab).
 */
export async function resolveListenerOwner(listener: ListeningSocket, { dockerPorts, unitPortHints, ownPort }: { dockerPorts: Set<number>; unitPortHints: Map<number, string>; ownPort: number }): Promise<ListenerOwner> {
  if (listener.port === 22 || listener.port === ownPort || listener.localAddress.startsWith("127.0.0.5")) return { kind: "ignored" };
  if (listener.processName && IGNORED_PROCESS_NAMES.has(listener.processName)) return { kind: "ignored" };
  if ((listener.processName && DOCKER_PROCESS_NAMES.has(listener.processName)) || dockerPorts.has(listener.port)) return { kind: "docker" };
  if (listener.processId !== null) {
    const unitOrDocker = await readUnitOfProcess(listener.processId);
    if (unitOrDocker === "docker") return { kind: "docker" };
    if (unitOrDocker) return { kind: "unit", unit: unitOrDocker };
  }
  const hintedUnit = unitPortHints.get(listener.port);
  if (hintedUnit) return { kind: "unit", unit: hintedUnit };
  return { kind: "process", processId: listener.processId, processName: listener.processName };
}

/**
 * Turns unowned listeners into `port:tcp/<port>` items: one per process when the PID is known,
 * otherwise one per port.
 */
export function toPortItems(listeners: readonly { listener: ListeningSocket; owner: Extract<ListenerOwner, { kind: "process" }> }[]): DiscoveredItem[] {
  const groups = new Map<string, ListeningSocket[]>();
  for (const { listener, owner } of listeners) {
    const groupKey = owner.processId !== null ? `pid:${owner.processId}` : `port:${listener.port}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), listener]);
  }
  return [...groups.values()].map((groupListeners) => {
    const ports = [...new Map(groupListeners.map((listener) => [`${listener.localAddress}:${listener.port}`, listener])).values()];
    const lowestPort = Math.min(...ports.map((listener) => listener.port));
    const processName = groupListeners[0]?.processName ?? null;
    return {
      key: `port:tcp/${lowestPort}`,
      source: "port",
      rawName: processName ? `${processName} :${lowestPort}` : `Port ${lowestPort}`,
      image: null,
      unit: null,
      processName,
      description: null,
      ports: ports.map((listener) => ({ hostPort: listener.port, containerPort: null, protocol: "tcp", hostAddress: listener.localAddress })),
      labels: {},
      state: "running",
      health: "none",
      startedAt: null,
      bindScope: widestBindScope(ports.map((listener) => classifyBindAddress(listener.localAddress))),
      extra: { processId: groupListeners[0]?.processId ?? null },
    } satisfies DiscoveredItem;
  });
}
