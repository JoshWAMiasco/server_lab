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

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 540;
const BOARD = { x: 166, y: 62, width: 468, height: 238 };
const PROCESSOR_CENTER_Y = 130;

function SpeakerGrille({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  const columns = Math.floor(width / 12);
  const rows = Math.floor(height / 12);
  return (
    <g className="pointer-events-none fill-foreground-faint/50" aria-hidden="true">
      <rect x={x} y={y} width={width} height={height} rx={10} strokeWidth={1} className="fill-surface stroke-line" />
      {Array.from({ length: rows * columns }, (_, holeIndex) => (
        <circle
          key={holeIndex}
          cx={x + 8 + (holeIndex % columns) * 12}
          cy={y + 8 + Math.floor(holeIndex / columns) * 12}
          r={1.8}
        />
      ))}
    </g>
  );
}

/**
 * A laptop seen from below with the bottom cover removed: mainboard with CPU (and discrete GPU
 * chips) under a heat pipe between two fans, SO-DIMM and M.2 slots, the battery, and a 2.5" bay
 * when a SATA disk is present.
 *
 * @example
 * <FormFactorLaptop inventory={inventory} model={buildMachineModel(inventory, gpus)} sample={sample} />
 */
export function FormFactorLaptop({ inventory, model, sample }: FormFactorProperties) {
  const processorLayout = distributeAlong({
    count: inventory.processors.length,
    start: 196,
    length: 136,
    preferredSize: 92,
    gap: 10,
  });
  const gpus = limitVisible(model.discreteGpus, 2);
  const gpuLayout = distributeAlong({
    count: gpus.visible.length,
    start: 352,
    length: 160,
    preferredSize: 74,
    gap: 10,
  });
  const memoryLayout = distributeAlong({
    count: model.memorySlots.length,
    start: 200,
    length: 92,
    preferredSize: 26,
    gap: 8,
  });
  const memoryLive = readMemoryLive(sample);
  const sticks = limitVisible(model.solidStateSticks, 3);
  const stickLayout = distributeAlong({
    count: sticks.visible.length,
    start: 200,
    length: 92,
    preferredSize: 24,
    gap: 8,
  });
  const wirelessAdapters = limitVisible(
    inventory.networkAdapters.filter((adapter) => adapter.isWireless),
    2,
  );
  const wiredAdapters = limitVisible(
    inventory.networkAdapters.filter((adapter) => !adapter.isWireless),
    4,
  );
  const bayDevices = limitVisible(model.driveBays, 2);
  const bayLayout = distributeAlong({
    count: bayDevices.visible.length,
    start: 650,
    length: 104,
    preferredSize: 104,
    gap: 8,
  });
  const externals = limitVisible(model.externalDrives, 2);
  const externalLayout = distributeAlong({
    count: externals.visible.length,
    start: 336,
    length: 150,
    preferredSize: 64,
    gap: 10,
  });
  const firstProcessorCenter =
    processorLayout.offsets.length > 0 ? offsetAt(processorLayout, 0) + processorLayout.size / 2 : 260;
  const lastChipCenter =
    gpuLayout.offsets.length > 0
      ? offsetAt(gpuLayout, gpuLayout.offsets.length - 1) + gpuLayout.size / 2
      : firstProcessorCenter;
  const heatPipePath = `M 110 ${PROCESSOR_CENTER_Y + 8} C 150 ${PROCESSOR_CENTER_Y + 8} 170 ${PROCESSOR_CENTER_Y} ${firstProcessorCenter} ${PROCESSOR_CENTER_Y} L ${lastChipCenter} ${PROCESSOR_CENTER_Y} C ${lastChipCenter + 80} ${PROCESSOR_CENTER_Y} 640 ${PROCESSOR_CENTER_Y + 8} 690 ${PROCESSOR_CENTER_Y + 8}`;
  return (
    <MachineSvgFrame viewWidth={VIEW_WIDTH} viewHeight={VIEW_HEIGHT} title="Inside the laptop, seen from below">
      <rect
        x={20}
        y={20}
        width={760}
        height={500}
        rx={30}
        strokeWidth={2}
        className="fill-surface-strong stroke-line-strong"
      />
      <rect x={32} y={32} width={736} height={476} rx={22} strokeWidth={1} className="fill-surface-muted stroke-line" />
      <Caption x={400} y={48} anchor="middle">
        Hinge side
      </Caption>

      <BoardShape inventory={inventory} bounds={BOARD} />
      <FanShape centerX={100} centerY={PROCESSOR_CENTER_Y + 8} radius={50} />
      <FanShape centerX={700} centerY={PROCESSOR_CENTER_Y + 8} radius={50} />
      <path
        d={heatPipePath}
        fill="none"
        strokeWidth={12}
        strokeLinecap="round"
        className="pointer-events-none stroke-accent/25"
      />
      <path
        d={heatPipePath}
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        className="pointer-events-none stroke-accent/60"
      />

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
      <MoreMarker x={560} y={PROCESSOR_CENTER_Y} count={gpus.hiddenCount} />

      {wirelessAdapters.visible.map((adapter, adapterIndex) => (
        <NetworkPortShape
          key={adapter.interfaceName}
          adapter={adapter}
          bounds={{ x: 540 + adapterIndex * 48, y: 76, width: 40, height: 30 }}
        />
      ))}

      <Caption x={200} y={196}>
        SO-DIMM
      </Caption>
      {model.memorySlots.map((slot, slotIndex) => (
        <MemorySlotShape
          key={slot.slotIndex}
          slot={slot}
          orientation="horizontal"
          bounds={{ x: 200, y: offsetAt(memoryLayout, slotIndex), width: 220, height: memoryLayout.size }}
        />
      ))}
      {memoryLive && <LiveBadge x={390} y={192} text={memoryLive.text} tone={memoryLive.tone} />}

      {sticks.visible.length > 0 && (
        <Caption x={446} y={196}>
          M.2
        </Caption>
      )}
      {sticks.visible.map((device, stickIndex) => (
        <SolidStateStickShape
          key={device.name}
          device={device}
          sample={sample}
          bounds={{ x: 446, y: offsetAt(stickLayout, stickIndex), width: 172, height: stickLayout.size }}
        />
      ))}
      <MoreMarker x={532} y={293} count={sticks.hiddenCount} />

      {wiredAdapters.visible.map((adapter, adapterIndex) => (
        <NetworkPortShape
          key={adapter.interfaceName}
          adapter={adapter}
          bounds={{ x: 22, y: 236 + adapterIndex * 30, width: 22, height: 22 }}
        />
      ))}

      <g className="pointer-events-none" aria-hidden="true">
        <rect
          x={166}
          y={318}
          width={468}
          height={176}
          rx={10}
          strokeWidth={1.25}
          className="fill-surface-strong stroke-line-strong"
        />
        {[0, 1, 2, 3].map((cellIndex) => (
          <rect
            key={cellIndex}
            x={180 + cellIndex * 112}
            y={332}
            width={104}
            height={124}
            rx={6}
            strokeWidth={1}
            className="fill-surface stroke-line"
          />
        ))}
        <text
          x={400}
          y={476}
          textAnchor="middle"
          fontSize={10}
          letterSpacing={1.5}
          className="fill-foreground-subtle uppercase"
        >
          Battery
        </text>
      </g>
      {externals.visible.length === 0 ? (
        <SpeakerGrille x={50} y={330} width={100} height={160} />
      ) : (
        externals.visible.map((device, externalIndex) => (
          <DriveBayShape
            key={device.name}
            device={device}
            sample={sample}
            bounds={{ x: 58, y: offsetAt(externalLayout, externalIndex), width: 92, height: externalLayout.size }}
          />
        ))
      )}
      {bayDevices.visible.length === 0 ? (
        <SpeakerGrille x={650} y={330} width={100} height={160} />
      ) : (
        bayDevices.visible.map((device, bayIndex) => (
          <DriveBayShape
            key={device.name}
            device={device}
            sample={sample}
            bounds={{ x: offsetAt(bayLayout, bayIndex), y: 322, width: bayLayout.size, height: 170 }}
          />
        ))
      )}
      <MoreMarker
        x={700}
        y={505}
        count={
          bayDevices.hiddenCount + externals.hiddenCount + wiredAdapters.hiddenCount + wirelessAdapters.hiddenCount
        }
      />
    </MachineSvgFrame>
  );
}
