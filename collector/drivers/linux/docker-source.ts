import { classifyBindAddress, widestBindScope } from "@/collector/parsers/parse-ss-listeners";
import { inspectContainer, listContainers } from "@/collector/sources/docker-client";
import type { DiscoveredItem, ItemHealth, ItemState } from "@/collector/types";

const INSPECT_CONCURRENCY = 8;

function mapContainerState(dockerState: string): ItemState {
  if (dockerState === "running") return "running";
  if (dockerState === "restarting" || dockerState === "created") return "starting";
  if (dockerState === "dead") return "failed";
  if (dockerState === "exited" || dockerState === "paused") return "exited";
  return "unknown";
}

function mapHealth(healthStatus: string | undefined): ItemHealth {
  if (healthStatus === "healthy" || healthStatus === "unhealthy" || healthStatus === "starting") return healthStatus;
  return "none";
}

async function mapWithConcurrency<InputType, OutputType>(inputs: readonly InputType[], limit: number, mapper: (input: InputType) => Promise<OutputType>): Promise<OutputType[]> {
  const outputs: OutputType[] = new Array(inputs.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, inputs.length) }, async () => {
    while (nextIndex < inputs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      outputs[currentIndex] = await mapper(inputs[currentIndex] as InputType);
    }
  });
  await Promise.all(workers);
  return outputs;
}

/**
 * Every container (running or not) as a Lobby item keyed by container name, so renames and
 * hides survive a container being recreated. `extra.containerId` feeds the app usage source.
 */
export async function discoverDockerContainers(): Promise<DiscoveredItem[]> {
  const containers = await listContainers();
  return mapWithConcurrency(containers, INSPECT_CONCURRENCY, async (container) => {
    const name = (container.Names[0] ?? container.Id.slice(0, 12)).replace(/^\//, "");
    let startedAt: number | null = null;
    let health: ItemHealth = "none";
    try {
      const inspection = await inspectContainer(container.Id);
      health = mapHealth(inspection.State.Health?.Status);
      const parsedStart = Date.parse(inspection.State.StartedAt);
      startedAt = Number.isFinite(parsedStart) && parsedStart > 0 ? parsedStart : null;
    } catch {
      /* Inspect failed (container removed meanwhile); keep the summary data. */
    }
    const publishedPorts = container.Ports.filter((port) => port.PublicPort !== undefined);
    const uniquePorts = new Map(publishedPorts.map((port) => [`${port.IP ?? "0.0.0.0"}:${port.PublicPort}/${port.Type}`, port]));
    const ports = [...uniquePorts.values()].map((port) => ({ hostPort: port.PublicPort as number, containerPort: port.PrivatePort, protocol: port.Type, hostAddress: port.IP ?? "0.0.0.0" }));
    return {
      key: `docker:${name}`,
      source: "docker" as const,
      rawName: name,
      image: container.Image,
      unit: null,
      processName: null,
      description: null,
      ports,
      labels: container.Labels ?? {},
      state: mapContainerState(container.State),
      health,
      startedAt: mapContainerState(container.State) === "running" ? startedAt : null,
      bindScope: ports.length > 0 ? widestBindScope(ports.map((port) => classifyBindAddress(port.hostAddress))) : "local",
      extra: { containerId: container.Id, status: container.Status },
    };
  });
}
