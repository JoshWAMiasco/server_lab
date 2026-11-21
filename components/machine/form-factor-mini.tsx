"use client";

import { distributeAlong, limitVisible, offsetAt } from "@/components/machine/machine-layout";
import { MachineSvgFrame } from "@/components/machine/machine-part";
import {
  BoardShape,
  Caption,
  DriveBayShape,
  FanShape,
  GpuShape,
  IntegratedGpuTag,
  LiveBadge,
  MemorySlotShape,
  MoreMarker,
  NetworkPortShape,
  ProcessorShape,
  SolidStateStickShape,
  readMemoryLive,
  type FormFactorProperties,
} from "@/components/machine/machine-svg-parts";

const VIEW_SIZE = 560;
const BOARD = { x: 48, y: 64, width: 464, height: 312 };
const PROCESSOR_CENTER_Y = 132;

/**
 * A mini PC with the lid off: compact board with a blower fan and heatsink, CPU, two SO-DIMM
 * slots, M.2 drives, rear I/O network ports, and a 2.5" bay under the board.
 *
 * @example
 * <FormFactorMini inventory={inventory} model={buildMachineModel(inventory, gpus)} sample={sample} />
 */
export function FormFactorMini({ inventory, model, sample }: FormFactorProperties) {
  const processorLayout = distributeAlong({
    count: inventory.processors.length,
    start: 250,
    length: 100,
    preferredSize: 92,
    gap: 8,
  });
  const gpus = limitVisible(model.discreteGpus, 2);
  const gpuLayout = distributeAlong({ count: gpus.visible.length, start: 366, length: 136, preferredSize: 66, gap: 6 });
  const memoryLayout = distributeAlong({
    count: model.memorySlots.length,
    start: 204,
    length: 84,
    preferredSize: 26,
    gap: 8,
  });
  const memoryLive = readMemoryLive(sample);
  const sticks = limitVisible(model.solidStateSticks, 3);
  const stickLayout = distributeAlong({
    count: sticks.visible.length,
    start: 270,
    length: 96,
    preferredSize: 24,
    gap: 8,
  });
  const adapters = limitVisible(inventory.networkAdapters, 6);
  const adapterLayout = distributeAlong({
    count: adapters.visible.length,
    start: 250,
    length: 250,
    preferredSize: 28,
    gap: 10,
  });
  const bayDevices = limitVisible([...model.driveBays, ...model.externalDrives], 3);
  const bays = bayDevices.visible.length > 0 ? bayDevices.visible : [null];
  const bayLayout = distributeAlong({ count: bays.length, start: 60, length: 440, preferredSize: 300, gap: 14 });
  return (
    <MachineSvgFrame viewWidth={VIEW_SIZE} viewHeight={VIEW_SIZE} title="Inside the mini PC">
      <rect
        x={20}
        y={20}
        width={520}
        height={520}
        rx={26}
        strokeWidth={2}
        className="fill-surface-strong stroke-line-strong"
      />
      <rect x={32} y={32} width={496} height={496} rx={18} strokeWidth={1} className="fill-surface-muted stroke-line" />
      <Caption x={48} y={52}>
        Rear I/O
      </Caption>
      {adapters.visible.map((adapter, adapterIndex) => (
        <NetworkPortShape
          key={adapter.interfaceName}
          adapter={adapter}
          bounds={{ x: offsetAt(adapterLayout, adapterIndex), y: 36, width: adapterLayout.size, height: 22 }}
        />
      ))}
      <MoreMarker x={516} y={48} count={adapters.hiddenCount} />

      <BoardShape inventory={inventory} bounds={BOARD} />
      <g className="pointer-events-none stroke-foreground-faint" strokeWidth={1.5} aria-hidden="true">
        {Array.from({ length: 12 }, (_, finIndex) => (
          <line key={finIndex} x1={56} x2={74} y1={96 + finIndex * 11} y2={96 + finIndex * 11} />
        ))}
      </g>
      <rect
        x={76}
        y={84}
        width={150}
        height={150}
        rx={22}
        strokeWidth={1.25}
        className="pointer-events-none fill-surface-strong stroke-line-strong"
      />
      <FanShape centerX={151} centerY={159} radius={62} />

      {inventory.processors.map((processor, processorIndex) => {
        const bounds = {
          x: offsetAt(processorLayout, processorIndex),
          y: PROCESSOR_CENTER_Y - processorLayout.size / 2,
          width: processorLayout.size,
          height: processorLayout.size,
        };
        return (
          <g key={processorIndex}>
            <ProcessorShape
              processor={processor}
              processorIndex={processorIndex}
              bounds={bounds}
              sample={sample}
              showLive={processorIndex === 0}
            />
            {processorIndex === 0 &&
              model.integratedGpus
                .slice(0, 2)
                .map((gpu, gpuIndex) => (
                  <IntegratedGpuTag
                    key={gpu.index}
                    gpu={gpu}
                    x={bounds.x + bounds.width - 38 - gpuIndex * 36}
                    y={bounds.y + 4}
                  />
                ))}
          </g>
        );
      })}
      {gpus.visible.map((gpu, gpuIndex) => (
        <GpuShape
          key={gpu.index}
          gpu={gpu}
          variant="chip"
          sample={sample}
          bounds={{
            x: offsetAt(gpuLayout, gpuIndex),
            y: PROCESSOR_CENTER_Y - gpuLayout.size / 2,
            width: gpuLayout.size,
            height: gpuLayout.size,
          }}
        />
      ))}
      <MoreMarker x={434} y={176} count={gpus.hiddenCount} />

      {model.memorySlots.map((slot, slotIndex) => (
        <MemorySlotShape
          key={slot.slotIndex}
          slot={slot}
          orientation="horizontal"
          bounds={{ x: 250, y: offsetAt(memoryLayout, slotIndex), width: 246, height: memoryLayout.size }}
        />
      ))}
      {memoryLive && <LiveBadge x={460} y={278} text={memoryLive.text} tone={memoryLive.tone} />}

      {sticks.visible.length > 0 && (
        <Caption x={66} y={264}>
          M.2
        </Caption>
      )}
      {sticks.visible.map((device, stickIndex) => (
        <SolidStateStickShape
          key={device.name}
          device={device}
          sample={sample}
          bounds={{ x: 66, y: offsetAt(stickLayout, stickIndex), width: 168, height: stickLayout.size }}
        />
      ))}
      <MoreMarker x={150} y={370} count={sticks.hiddenCount} />

      <Caption x={60} y={398}>
        2.5&quot; bay
      </Caption>
      {bays.map((device, bayIndex) => (
        <DriveBayShape
          key={device?.name ?? "empty"}
          device={device}
          sample={sample}
          bounds={{ x: offsetAt(bayLayout, bayIndex), y: 410, width: bayLayout.size, height: 96 }}
        />
      ))}
      <MoreMarker x={480} y={398} count={bayDevices.hiddenCount} />
    </MachineSvgFrame>
  );
}
