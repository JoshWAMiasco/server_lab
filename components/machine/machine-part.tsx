"use client";

import { createContext, useContext, useState, type KeyboardEvent, type ReactNode } from "react";
import { readCardIdentifier, type PartBounds } from "@/components/machine/machine-layout";
import { mergeClassNames } from "@/utilities/merge-class-names";

interface MachineSelection {
  selectedPartId: string | null;
  selectPart: (partId: string, origin: "illustration" | "card") => void;
}

interface HoveredPart {
  label: string;
  bounds: PartBounds;
}

interface MachineHover {
  setHoveredPart: (part: HoveredPart | null) => void;
}

const MachineSelectionContext = createContext<MachineSelection>({ selectedPartId: null, selectPart: () => undefined });
const MachineHoverContext = createContext<MachineHover>({ setHoveredPart: () => undefined });

/**
 * Shares the selected part between the illustration and the detail cards.
 *
 * @example
 * <MachineSelectionProvider selectedPartId={selectedPartId} selectPart={selectPart}>…</MachineSelectionProvider>
 */
export function MachineSelectionProvider({
  selectedPartId,
  selectPart,
  children,
}: MachineSelection & { children: ReactNode }) {
  return <MachineSelectionContext value={{ selectedPartId, selectPart }}>{children}</MachineSelectionContext>;
}

/**
 * Reads the selected part and the function that selects one.
 *
 * @example
 * const { selectedPartId, selectPart } = useMachineSelection();
 */
export function useMachineSelection(): MachineSelection {
  return useContext(MachineSelectionContext);
}

const TOOLTIP_HEIGHT = 22;

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}

/**
 * The `<svg>` of a machine illustration. It scales with its viewBox (at most 520 px tall) and draws
 * the floating label of the hovered or focused part on top of everything else.
 *
 * @example
 * <MachineSvgFrame viewWidth={800} viewHeight={600} title="Inside the desktop">…parts…</MachineSvgFrame>
 */
export function MachineSvgFrame({
  viewWidth,
  viewHeight,
  title,
  children,
}: {
  viewWidth: number;
  viewHeight: number;
  title: string;
  children: ReactNode;
}) {
  const [hoveredPart, setHoveredPart] = useState<HoveredPart | null>(null);
  const tooltipWidth = hoveredPart ? estimateTextWidth(hoveredPart.label, 12) + 20 : 0;
  const tooltipX = hoveredPart
    ? Math.min(
        viewWidth - tooltipWidth - 4,
        Math.max(4, hoveredPart.bounds.x + hoveredPart.bounds.width / 2 - tooltipWidth / 2),
      )
    : 0;
  const tooltipY = hoveredPart
    ? hoveredPart.bounds.y - TOOLTIP_HEIGHT - 8 >= 2
      ? hoveredPart.bounds.y - TOOLTIP_HEIGHT - 8
      : Math.min(viewHeight - TOOLTIP_HEIGHT - 2, hoveredPart.bounds.y + hoveredPart.bounds.height + 8)
    : 0;
  return (
    <MachineHoverContext value={{ setHoveredPart }}>
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        role="group"
        aria-label={title}
        className="mx-auto block h-auto max-h-[520px] w-full select-none"
        style={{ aspectRatio: `${viewWidth} / ${viewHeight}` }}
        fontFamily="inherit"
      >
        {children}
        {hoveredPart && (
          <g className="pointer-events-none" aria-hidden="true">
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={TOOLTIP_HEIGHT}
              rx={4}
              className="fill-foreground-strong"
            />
            <text
              x={tooltipX + tooltipWidth / 2}
              y={tooltipY + TOOLTIP_HEIGHT / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12}
              className="fill-canvas"
            >
              {hoveredPart.label}
            </text>
          </g>
        )}
      </svg>
    </MachineHoverContext>
  );
}

/**
 * One interactive part of the illustration: focusable, keyboard-activatable, outlined on hover,
 * focus and selection, and labelled with a floating tooltip. `bounds` is the outline drawn around it.
 *
 * @example
 * <MachinePart partId="processor-0" label="CPU · Ryzen 7 5700G" bounds={{ x: 10, y: 10, width: 80, height: 80 }}>
 *   <rect … />
 * </MachinePart>
 */
export function MachinePart({
  partId,
  label,
  bounds,
  children,
}: {
  partId: string;
  label: string;
  bounds: PartBounds;
  children: ReactNode;
}) {
  const { selectedPartId, selectPart } = useMachineSelection();
  const { setHoveredPart } = useContext(MachineHoverContext);
  const isSelected =
    selectedPartId !== null && (selectedPartId === partId || selectedPartId === readCardIdentifier(partId));
  const showTooltip = () => setHoveredPart({ label, bounds });
  const hideTooltip = () => setHoveredPart(null);
  const handleKeyDown = (keyboardEvent: KeyboardEvent<SVGGElement>) => {
    if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
    keyboardEvent.preventDefault();
    selectPart(partId, "illustration");
  };
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={isSelected}
      className="group cursor-pointer outline-none"
      onClick={() => selectPart(partId, "illustration")}
      onKeyDown={handleKeyDown}
      onPointerEnter={showTooltip}
      onPointerLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      <rect
        x={bounds.x - 3}
        y={bounds.y - 3}
        width={bounds.width + 6}
        height={bounds.height + 6}
        rx={5}
        strokeWidth={2}
        strokeDasharray={isSelected ? undefined : "5 4"}
        className={mergeClassNames(
          "pointer-events-none fill-brand/5 stroke-brand transition-opacity duration-150",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      />
    </g>
  );
}
