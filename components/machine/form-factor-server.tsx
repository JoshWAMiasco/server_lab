"use client";

import { distributeAlong, limitVisible, offsetAt, type MemorySlot } from "@/components/machine/machine-layout";
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
  PowerSupplyShape,
  ProcessorShape,
  SolidStateStickShape,
  readMemoryLive,
  type FormFactorProperties,
} from "@/components/machine/machine-svg-parts";

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 540;
const BOARD = { x: 40, y: 58, width: 560, height: 290 };
const SOCKET_CENTER_Y = 160;
const SLOT_TOP = 84;
const SLOT_HEIGHT = 152;

interface SocketLayout {
  socketBounds: { x: number; y: number; width: number; height: number } | null;
  processorIndex: number;
  slots: { slot: MemorySlot; x: number; width: number }[];
}

function layoutSockets(processorCount: number, memorySlots: readonly MemorySlot[]): SocketLayout[] {
  const socketCount = Math.max(1, processorCount);
  const segmentWidth = BOARD.width / socketCount;
  const slotsPerSocket = Math.ceil(memorySlots.length / socketCount);
  return Array.from({ length: socketCount }, (_, socketIndex) => {
    const segmentStart = BOARD.x + socketIndex * segmentWidth;
    const socketSize = Math.min(88, segmentWidth * 0.32);
    const socketX = segmentStart + segmentWidth / 2 - socketSize / 2;
    const socketSlots = memorySlots.slice(socketIndex * slotsPerSocket, (socketIndex + 1) * slotsPerSocket);
    const leftSlots = socketSlots.slice(0, Math.ceil(socketSlots.length / 2));
    const rightSlots = socketSlots.slice(leftSlots.length);
    const leftLayout = distributeAlong({
      count: leftSlots.length,
      start: segmentStart + 14,
      length: socketX - segmentStart - 30,
      preferredSize: 12,
      gap: 6,
    });
    const rightLayout = distributeAlong({
      count: rightSlots.length,
      start: socketX + socketSize + 16,
      length: segmentStart + segmentWidth - socketX - socketSize - 30,
      preferredSize: 12,
      gap: 6,
    });
    return {
      socketBounds:
        processorCount > 0
          ? { x: socketX, y: SOCKET_CENTER_Y - socketSize / 2, width: socketSize, height: socketSize }
          : null,
      processorIndex: socketIndex,
      slots: [
        ...leftSlots.map((slot, slotIndex) => ({ slot, x: offsetAt(leftLayout, slotIndex), width: leftLayout.size })),
        ...rightSlots.map((slot, slotIndex) => ({
          slot,
          x: offsetAt(rightLayout, slotIndex),
          width: rightLayout.size,
        })),
      ],
    };
  });
}

/**
 * A rack server seen from above with the lid off: rear network ports, one board with one socket per
 * processor flanked by its DIMM slots, GPUs on risers, redundant PSUs and M.2 boot drives on the
 * right, a fan wall, and the drive bays across the front.
 *
 * @example
 * <FormFactorServer inventory={inventory} model={buildMachineModel(inventory, gpus)} sample={sample} />
 */
export function FormFactorServer({ inventory, model, sample }: FormFactorProperties) {
  const sockets = layoutSockets(inventory.processors.length, model.memorySlots);
  const memoryLive = readMemoryLive(sample);
  const adapters = limitVisible(inventory.networkAdapters, 8);
  const adapterLayout = distributeAlong({
    count: adapters.visible.length,
    start: 140,
    length: 300,
    preferredSize: 26,
    gap: 8,
  });
  const gpus = limitVisible(model.discreteGpus, 8);
  const gpuColumns = Math.min(4, gpus.visible.length);
  const gpuRows = Math.ceil(gpus.visible.length / 4);
  const gpuColumnLayout = distributeAlong({ count: gpuColumns, start: 52, length: 536, preferredSize: 200, gap: 10 });
  const gpuRowLayout = distributeAlong({
    count: gpuRows,
    start: 262,
    length: 76,
    preferredSize: gpuRows > 1 ? 30 : 46,
    gap: 16,
  });
  const sticks = limitVisible(model.solidStateSticks, 4);
  const stickLayout = distributeAlong({
    count: sticks.visible.length,
    start: 256,
    length: 90,
    preferredSize: 22,
    gap: 6,
  });
  const bayDevices = limitVisible([...model.driveBays, ...model.externalDrives], 12);
  const bays = [
    ...bayDevices.visible,
    ...Array.from({ length: Math.max(0, 8 - bayDevices.visible.length) }, () => null),
  ];
  const bayLayout = distributeAlong({ count: bays.length, start: 40, length: 720, preferredSize: 70, gap: 8 });
  const fanLayout = distributeAlong({ count: 6, start: 40, length: 720, preferredSize: 44, gap: 60 });
  return (
    <MachineSvgFrame viewWidth={VIEW_WIDTH} viewHeight={VIEW_HEIGHT} title="Inside the rack server, seen from above">
      <rect
        x={16}
        y={16}
        width={768}
        height={508}
        rx={8}
        strokeWidth={2}
        className="fill-surface-strong stroke-line-strong"
      />
      <rect x={26} y={26} width={748} height={488} rx={4} strokeWidth={1} className="fill-surface-muted stroke-line" />
      <Caption x={40} y={44}>
        Rear
      </Caption>
      {adapters.visible.map((adapter, adapterIndex) => (
        <NetworkPortShape
          key={adapter.interfaceName}
          adapter={adapter}
          bounds={{ x: offsetAt(adapterLayout, adapterIndex), y: 30, width: adapterLayout.size, height: 22 }}
        />
      ))}
      <MoreMarker x={470} y={42} count={adapters.hiddenCount} />

      <BoardShape inventory={inventory} bounds={BOARD} />
      {sockets.map(({ socketBounds, processorIndex, slots }) => {
        const processor = inventory.processors[processorIndex];
        return (
          <g key={processorIndex}>
            {slots.map(({ slot, x, width }) => (
              <MemorySlotShape
                key={slot.slotIndex}
                slot={slot}
                orientation="vertical"
                bounds={{ x, y: SLOT_TOP, width, height: SLOT_HEIGHT }}
              />
            ))}
            {processor && socketBounds && (
              <>
                <ProcessorShape
                  processor={processor}
                  processorIndex={processorIndex}
                  bounds={socketBounds}
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
                        x={socketBounds.x + socketBounds.width - 38 - gpuIndex * 36}
                        y={socketBounds.y + 4}
                      />
                    ))}
              </>
            )}
          </g>
        );
      })}
      {memoryLive && (
        <LiveBadge
          x={BOARD.x + BOARD.width / 2}
          y={SLOT_TOP + SLOT_HEIGHT + 12}
          text={memoryLive.text}
          tone={memoryLive.tone}
        />
      )}

      {gpus.visible.length === 0 && (
        <g className="pointer-events-none" aria-hidden="true">
          {[0, 1].map((riserIndex) => (
            <rect
              key={riserIndex}
              x={70 + riserIndex * 270}
              y={280}
              width={240}
              height={40}
              rx={3}
              strokeWidth={1}
              strokeDasharray="4 3"
              className="fill-none stroke-line-strong"
            />
          ))}
          <Caption x={320} y={304} anchor="middle">
            PCIe risers
          </Caption>
        </g>
      )}
      {gpus.visible.map((gpu, gpuIndex) => (
        <GpuShape
          key={gpu.index}
          gpu={gpu}
          variant="card"
          sample={sample}
          bounds={{
            x: offsetAt(gpuColumnLayout, gpuIndex % 4),
            y: offsetAt(gpuRowLayout, Math.floor(gpuIndex / 4)),
            width: gpuColumnLayout.size,
            height: gpuRowLayout.size,
          }}
        />
      ))}
      <MoreMarker x={560} y={254} count={gpus.hiddenCount} />

      <PowerSupplyShape bounds={{ x: 616, y: 58, width: 144, height: 80 }} label="PSU 1" />
      <PowerSupplyShape bounds={{ x: 616, y: 146, width: 144, height: 80 }} label="PSU 2" />
      <Caption x={618} y={248}>
        M.2 · boot
      </Caption>
      {sticks.visible.map((device, stickIndex) => (
        <SolidStateStickShape
          key={device.name}
          device={device}
          sample={sample}
          bounds={{ x: 618, y: offsetAt(stickLayout, stickIndex), width: 140, height: stickLayout.size }}
        />
      ))}
      <MoreMarker x={688} y={350} count={sticks.hiddenCount} />

      {fanLayout.offsets.map((fanOffset) => (
        <FanShape key={fanOffset} centerX={fanOffset + fanLayout.size / 2} centerY={382} radius={18} />
      ))}
      <Caption x={760} y={414} anchor="end">
        Front
      </Caption>
      {bays.map((device, bayIndex) => (
        <DriveBayShape
          key={device?.name ?? `empty-${bayIndex}`}
          device={device}
          sample={sample}
          bounds={{ x: offsetAt(bayLayout, bayIndex), y: 420, width: bayLayout.size, height: 86 }}
        />
      ))}
      <MoreMarker x={400} y={414} count={bayDevices.hiddenCount} />
    </MachineSvgFrame>
  );
}
