"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { mergeClassNames } from "@/utilities/merge-class-names";

export type AccordionVariant = "plain" | "boxed";

interface AccordionContextValue {
  variant: AccordionVariant;
  isItemOpen: (itemIdentifier: string) => boolean;
  toggleItem: (itemIdentifier: string) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

export interface AccordionProps {
  variant?: AccordionVariant;
  allowsMultipleOpen?: boolean;
  defaultOpenItemIdentifiers?: readonly string[];
  className?: string;
  children: ReactNode;
}

/**
 * A list of collapsible sections. By default opening one closes the others; set
 * `allowsMultipleOpen` to let several stay open. Item content can be server-rendered.
 *
 * @example
 * <Accordion variant="boxed" defaultOpenItemIdentifiers={["installation"]}>
 *   <AccordionItem itemIdentifier="installation" title="How do I install the template?">
 *     Run npm install, then npm run dev.
 *   </AccordionItem>
 *   <AccordionItem itemIdentifier="license" title="Which license applies?">…</AccordionItem>
 * </Accordion>
 */
export function Accordion({ variant = "plain", allowsMultipleOpen = false, defaultOpenItemIdentifiers = [], className, children }: AccordionProps) {
  const [openItemIdentifiers, setOpenItemIdentifiers] = useState<readonly string[]>(defaultOpenItemIdentifiers);
  const contextValue: AccordionContextValue = {
    variant,
    isItemOpen: (itemIdentifier) => openItemIdentifiers.includes(itemIdentifier),
    toggleItem: (itemIdentifier) =>
      setOpenItemIdentifiers((currentIdentifiers) => {
        if (currentIdentifiers.includes(itemIdentifier)) return currentIdentifiers.filter((identifier) => identifier !== itemIdentifier);
        return allowsMultipleOpen ? [...currentIdentifiers, itemIdentifier] : [itemIdentifier];
      }),
  };
  return (
    <AccordionContext.Provider value={contextValue}>
      <div className={mergeClassNames("accordion", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

export interface AccordionItemProps {
  itemIdentifier: string;
  title: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * One collapsible section of an `Accordion`.
 *
 * @example
 * <AccordionItem itemIdentifier="shipping" title="Shipping">We ship worldwide.</AccordionItem>
 */
export function AccordionItem({ itemIdentifier, title, className, children }: AccordionItemProps) {
  const accordionContext = useContext(AccordionContext);
  const panelIdentifier = useId();
  if (!accordionContext) throw new Error("AccordionItem must be used inside <Accordion>.");
  const isOpen = accordionContext.isItemOpen(itemIdentifier);
  return (
    <div
      className={mergeClassNames(
        "py-4 first:-mt-4 last:-mb-4 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line/60",
        accordionContext.variant === "boxed" && "mt-3 border border-line/60 p-4 first:mt-0 last:mb-0",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelIdentifier}
        onClick={() => accordionContext.toggleItem(itemIdentifier)}
        className={mergeClassNames("-my-4 w-full cursor-pointer py-4 text-left font-medium outline-hidden", isOpen && "text-primary")}
      >
        {title}
      </button>
      <div id={panelIdentifier} role="region" hidden={!isOpen} className="mt-3 leading-relaxed text-foreground-strong">
        <div className="leading-relaxed text-foreground">{children}</div>
      </div>
    </div>
  );
}
