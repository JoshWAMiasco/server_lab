"use client";

import { Popover as HeadlessPopover, PopoverButton, PopoverPanel } from "@headlessui/react";
import type { ReactNode } from "react";
import { mergeClassNames } from "@/utilities/merge-class-names";
import type { DropdownMenuPlacement } from "@/components/interactive/dropdown-menu";

export interface PopoverProps {
  trigger: ReactNode;
  placement?: DropdownMenuPlacement;
  triggerClassName?: string;
  panelClassName?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A floating panel for rich content (filters, forms, previews) opened by `trigger`.
 * Unlike `DropdownMenu`, focus can move freely inside it.
 *
 * @example
 * <Popover trigger={<Button variant="outline-secondary">Filter</Button>} panelClassName="w-72 p-5">
 *   <FormField label="Status"><FormSelect options={statusOptions} /></FormField>
 * </Popover>
 */
export function Popover({ trigger, placement = "bottom end", triggerClassName, panelClassName, className, children }: PopoverProps) {
  return (
    <HeadlessPopover className={mergeClassNames("relative", className)}>
      <PopoverButton as="div" className={mergeClassNames("cursor-pointer focus-visible:outline-hidden", triggerClassName)}>
        {trigger}
      </PopoverButton>
      <PopoverPanel
        anchor={{ to: placement, gap: 4 }}
        transition
        className={mergeClassNames(
          "z-50 rounded-md border border-line-strong bg-surface-muted p-2 shadow-overlay transition duration-150 ease-linear data-closed:translate-y-1 data-closed:opacity-0",
          panelClassName,
        )}
      >
        {children}
      </PopoverPanel>
    </HeadlessPopover>
  );
}
