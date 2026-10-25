import { Cog, Container, Globe, PenLine, Plug, ShieldAlert, Waypoints } from "lucide-react";
import { Tooltip } from "@/components/interactive/tooltip";
import { Badge } from "@/components/primitives/badge";
import type { LobbyCard } from "@/lib/queries/lobby-types";

const SOURCE_APPEARANCE = {
  docker: { label: "Docker", icon: Container, tone: "info" },
  systemd: { label: "systemd", icon: Cog, tone: "slate" },
  port: { label: "Process", icon: Plug, tone: "slate" },
  nginx: { label: "nginx", icon: Globe, tone: "success" },
  manual: { label: "Manual", icon: PenLine, tone: "secondary" },
} as const;

/**
 * Where a Lobby item came from: Docker, systemd, a bare process, an nginx site or a manual entry.
 *
 * @example
 * <SourceBadge source="docker" />
 */
export function SourceBadge({ source }: { source: LobbyCard["source"] }) {
  const appearance = SOURCE_APPEARANCE[source];
  const Icon = appearance.icon;
  return (
    <Badge tone={appearance.tone} className="gap-1 pr-2">
      <Icon className="h-3 w-3 stroke-[1.6]" />
      {appearance.label}
    </Badge>
  );
}

/**
 * The exposure check: nothing for 127.0.0.1-only items, "Tailnet" for the Tailscale IP, and a
 * warning when something listens on all interfaces or a LAN address.
 *
 * @example
 * <ExposureBadge bindScope="exposed" ports={card.ports} />
 */
export function ExposureBadge({ bindScope, ports }: { bindScope: LobbyCard["bindScope"]; ports: LobbyCard["ports"] }) {
  if (bindScope === "local") return null;
  if (bindScope === "tailnet") {
    return (
      <Badge tone="info" variant="outline" className="gap-1 pr-2">
        <Waypoints className="h-3 w-3" />
        Tailnet
      </Badge>
    );
  }
  const exposedPorts = ports.filter((port) => !port.hostAddress.startsWith("127.") && port.hostAddress !== "::1" && !port.hostAddress.startsWith("100."));
  return (
    <Tooltip content={`Listening on ${exposedPorts.map((port) => `${port.hostAddress}:${port.hostPort}`).join(", ")}. Bind it to 127.0.0.1 and publish it through nginx on the Tailscale IP.`}>
      <Badge tone="warning" variant="soft" className="gap-1 pr-2">
        <ShieldAlert className="h-3 w-3" />
        Exposed to LAN
      </Badge>
    </Tooltip>
  );
}
