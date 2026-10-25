"use client";

import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";
import type { ReactNode } from "react";
import { mergeClassNames } from "@/utilities/merge-class-names";

/**
 * A scroll container with the template's thin custom scrollbar (simplebar). Give it a height or
 * `maximumHeight`.
 *
 * @example
 * <ScrollableArea maximumHeight="400px"><ConversationList conversations={conversations} /></ScrollableArea>
 */
export function ScrollableArea({ maximumHeight, className, children }: { maximumHeight?: string; className?: string; children: ReactNode }) {
  return (
    <SimpleBar style={maximumHeight ? { maxHeight: maximumHeight } : undefined} className={mergeClassNames("[&_.simplebar-scrollbar]:before:bg-foreground-subtle/30", className)}>
      {children}
    </SimpleBar>
  );
}
