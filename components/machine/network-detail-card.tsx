"use client";

import { EthernetPort, Wifi } from "lucide-react";
import type { NetworkAdapter } from "@/collector/types";
import { formatLinkSpeed } from "@/components/machine/machine-layout";
import { DetailList, LiveMeter, PartCard } from "@/components/machine/part-detail-cards";
import { Badge } from "@/components/primitives/badge";
import type { LiveSystemSample } from "@/lib/queries/live-types";
import { formatBytes } from "@/utilities/format-number";

/**
 * One network adapter: model, driver, MAC address, link speed and state, with live throughput.
 *
 * @example
 * <NetworkDetailCard adapter={adapter} sample={sample} />
 */
export function NetworkDetailCard({ adapter, sample }: { adapter: NetworkAdapter; sample: LiveSystemSample | null }) {
  const reading =
    sample?.networkInterfaces.find((networkInterface) => networkInterface.interfaceName === adapter.interfaceName) ??
    null;
  return (
    <PartCard
      partId={`network-${adapter.interfaceName}`}
      icon={adapter.isWireless ? <Wifi className="h-4 w-4" /> : <EthernetPort className="h-4 w-4" />}
      title={adapter.interfaceName}
      subtitle={adapter.model ?? (adapter.isWireless ? "Wireless adapter" : "Ethernet adapter")}
      badges={
        <Badge tone={adapter.isUp ? "success" : "slate"} variant="soft">
          {adapter.isUp ? "Up" : "Down"}
        </Badge>
      }
    >
      {reading && (
        <div className="mb-4 grid grid-cols-2 gap-4">
          <LiveMeter
            label="Receive"
            value={`${formatBytes(reading.receivedBytesPerSecond, { maximumFractionDigits: 1 })}/s`}
            tone="slate"
          />
          <LiveMeter
            label="Send"
            value={`${formatBytes(reading.transmittedBytesPerSecond, { maximumFractionDigits: 1 })}/s`}
            tone="slate"
          />
        </div>
      )}
      <DetailList
        rows={[
          ["Type", adapter.isWireless ? "Wireless" : "Wired"],
          ["Model", adapter.model],
          ["Driver", adapter.driver],
          ["MAC address", adapter.macAddress ? <span className="font-mono text-xs">{adapter.macAddress}</span> : null],
          [
            "Link speed",
            adapter.isUp
              ? adapter.speedMegabits === null
                ? null
                : formatLinkSpeed(adapter.speedMegabits)
              : "Link down",
          ],
        ]}
      />
    </PartCard>
  );
}
