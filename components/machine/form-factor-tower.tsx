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
  PowerSupplyShape,
  ProcessorShape,
  SolidStateStickShape,
  readMemoryLive,
  type FormFactorProperties,
} from "@/components/machine/machine-svg-parts";

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;
const BOARD = { x: 120, y: 46, width: 410, height: 414 };
const GPU_ZONE = { start: 266, length: 186 };

/**
 * A desktop tower with its side panel off: ATX board with sockets, DIMM slots, PCIe GPUs and
 * M.2 drives, drive cage and front fans on the right, power supply under the shroud.
 *
 * @example
 * <FormFactorTower inventory={inventory} model={buildMachineModel(inventory, gpus)} sample={sample} />
 */
export function FormFactorTower({ inventory, model, sample }: FormFactorProperties) {
  const processorLayout = distributeAlong({
    count: inventory.processors.length,
    start: 186,
    length: 208,
    preferredSize: 112,
    gap: 14,
  });
  const memoryLayout = distributeAlong({
    count: model.memorySlots.length,
    start: 410,
    length: 108,
    preferredSize: 15,
    gap: 8,
  });
  const memoryLive = readMemoryLive(sample);
  const gpus = limitVisible(model.discreteGpus, 8);
  const gpuLayout = distributeAlong({
    count: gpus.visible.length,
    start: GPU_ZONE.start,
    length: GPU_ZONE.length,
    preferredSize: 40,
    gap: 10,
  });
  const sticks = limitVisible(model.solidStateSticks, 8);
  const stickRows =
    sticks.visible.length > 4 ? [sticks.visible.slice(0, 4), sticks.visible.slice(4)] : [sticks.visible];
  const stickRowHeight = stickRows.length > 1 ? 84 : 150;
  const bayDevices = limitVisible(model.driveBays, 6);
  const bays = [
    ...bayDevices.visible,
    ...Array.from({ length: Math.max(0, 3 - bayDevices.visible.length) }, () => null),
  ];
  const bayLayout = distributeAlong({ count: bays.length, start: 56, length: 236, preferredSize: 36, gap: 8 });
  const adapters = limitVisible(inventory.networkAdapters, 6);
  const externals = limitVisible(model.externalDrives, 3);
  const externalLayout = distributeAlong({
    count: externals.visible.length,
    start: 330,
    length: 420,
    preferredSize: 130,
    gap: 14,
  });
  return (
    <MachineSvgFrame viewWidth={VIEW_WIDTH} viewHeight={VIEW_HEIGHT} title="Inside the desktop tower">
      <rect
        x={16}
        y={16}
        width={768}
        height={568}
        rx={16}
        strokeWidth={2}
        className="fill-surface-strong stroke-line-strong"
      />
      <rect x={28} y={28} width={744} height={544} rx={10} strokeWidth={1} className="fill-surface-muted stroke-line" />
      <Caption x={36} y={44}>
        Rear
      </Caption>
      <Caption x={764} y={44} anchor="end">
        Front
      </Caption>
      <FanShape centerX={78} centerY={112} radius={32} />
      {Array.from({ length: 7 }, (_, bracketIndex) => (
        <rect
          key={bracketIndex}
          x={32}
          y={262 + bracketIndex * 27}
          width={12}
          height={22}
          rx={1}
          strokeWidth={1}
          className="fill-none stroke-line"
        />
      ))}

      <BoardShape inventory={inventory} bounds={BOARD} />
      <rect
        x={126}
        y={56}
        width={32}
        height={176}
        rx={2}
        strokeWidth={1}
        className="pointer-events-none fill-surface-strong stroke-line-strong"
      />
      {adapters.visible.map((adapter, adapterIndex) => (
        <NetworkPortShape
          key={adapter.interfaceName}
          adapter={adapter}
          bounds={{ x: 131, y: 64 + adapterIndex * 26, width: 22, height: 19 }}
        />
      ))}
      <MoreMarker x={142} y={222} count={adapters.hiddenCount} />

      {inventory.processors.map((processor, processorIndex) => {
        const bounds = {
          x: offsetAt(processorLayout, processorIndex),
          y: 150 - processorLayout.size / 2,
          width: processorLayout.size,
          height: processorLayout.size,
        };
        return (
          <g key={processorIndex}>
            <rect
              x={bounds.x - 9}
              y={bounds.y - 9}
              width={bounds.width + 18}
              height={bounds.height + 18}
              rx={8}
              strokeWidth={1}
              strokeDasharray="6 4"
              className="pointer-events-none fill-none stroke-foreground-faint"
            />
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
                    x={bounds.x + bounds.width - 40 - gpuIndex * 38}
                    y={bounds.y + 4}
                  />
                ))}
          </g>
        );
      })}

      {model.memorySlots.map((slot, slotIndex) => (
        <MemorySlotShape
          key={slot.slotIndex}
          slot={slot}
          orientation="vertical"
          bounds={{ x: offsetAt(memoryLayout, slotIndex), y: 62, width: memoryLayout.size, height: 172 }}
        />
      ))}
      {memoryLive && <LiveBadge x={464} y={248} text={memoryLive.text} tone={memoryLive.tone} />}

      {gpus.visible.length === 0 &&
        [300, 360, 420].map((slotY) => (
          <rect
            key={slotY}
            x={170}
            y={slotY}
            width={230}
            height={8}
            rx={2}
            strokeWidth={1}
            className="pointer-events-none fill-surface-strong stroke-line-strong"
          />
        ))}
      {gpus.visible.map((gpu, gpuIndex) => {
        const cardY = offsetAt(gpuLayout, gpuIndex);
        return (
          <g key={gpu.index}>
            <rect
              x={32}
              y={cardY - 2}
              width={14}
              height={gpuLayout.size + 4}
              rx={1}
              className="pointer-events-none fill-foreground-faint/40"
            />
            <GpuShape
              gpu={gpu}
              variant="card"
              sample={sample}
              bounds={{ x: 46, y: cardY, width: 374, height: gpuLayout.size }}
            />
          </g>
        );
      })}
      <MoreMarker x={235} y={457} count={gpus.hiddenCount} />

      {stickRows.map((row, rowIndex) => {
        const rowLayout = distributeAlong({ count: row.length, start: 430, length: 92, preferredSize: 18, gap: 6 });
        return row.map((device, stickIndex) => (
          <SolidStateStickShape
            key={device.name}
            device={device}
            sample={sample}
            bounds={{
              x: offsetAt(rowLayout, stickIndex),
              y: 272 + rowIndex * (stickRowHeight + 12),
              width: rowLayout.size,
              height: stickRowHeight,
            }}
          />
        ));
      })}
      <MoreMarker x={476} y={454} count={sticks.hiddenCount} />

      <rect
        x={552}
        y={46}
        width={212}
        height={254}
        rx={6}
        strokeWidth={1}
        strokeDasharray="6 4"
        className="pointer-events-none fill-none stroke-line-strong"
      />
      <Caption x={560} y={312}>
        Drive bays
      </Caption>
      {bays.map((device, bayIndex) => (
        <DriveBayShape
          key={device?.name ?? `empty-${bayIndex}`}
          device={device}
          sample={sample}
          bounds={{ x: 564, y: offsetAt(bayLayout, bayIndex), width: 188, height: bayLayout.size }}
        />
      ))}
      <MoreMarker x={700} y={312} count={bayDevices.hiddenCount} />
      <FanShape centerX={608} centerY={390} radius={38} />
      <FanShape centerX={710} centerY={390} radius={38} />

      <rect
        x={28}
        y={470}
        width={744}
        height={102}
        rx={4}
        strokeWidth={1}
        className="pointer-events-none fill-surface-strong/60 stroke-line"
      />
      <PowerSupplyShape bounds={{ x: 40, y: 484, width: 250, height: 76 }} label="PSU" />
      {externals.visible.length > 0 && (
        <Caption x={330} y={492}>
          External · USB
        </Caption>
      )}
      {externals.visible.map((device, externalIndex) => (
        <DriveBayShape
          key={device.name}
          device={device}
          sample={sample}
          bounds={{ x: offsetAt(externalLayout, externalIndex), y: 506, width: externalLayout.size, height: 40 }}
        />
      ))}
      <MoreMarker x={740} y={492} count={externals.hiddenCount} />
    </MachineSvgFrame>
  );
}
