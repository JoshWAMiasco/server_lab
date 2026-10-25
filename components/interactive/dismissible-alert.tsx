"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { createAlertClassNames, type StaticAlertProps } from "@/components/primitives/static-alert";
import { mergeClassNames } from "@/utilities/merge-class-names";

export interface DismissibleAlertProps extends StaticAlertProps {
  onDismiss?: () => void;
}

/**
 * An alert with a close button. Same props as `StaticAlert`.
 *
 * @example
 * <DismissibleAlert tone="primary" variant="soft" icon={<AlertCircle className="mr-2 h-6 w-6" />}>
 *   Your profile is 68% complete.
 * </DismissibleAlert>
 */
export function DismissibleAlert({ tone, variant, icon, title, actions, onDismiss, className, children, ...divisionAttributes }: DismissibleAlertProps) {
  const [isVisible, setIsVisible] = useState(true);
  if (!isVisible) return null;
  return (
    <div role="alert" className={createAlertClassNames({ tone, variant, className: mergeClassNames("flex items-center", className) })} {...divisionAttributes}>
      {icon}
      <div className="flex-1">
        {title && <div className="text-lg font-medium font-display">{title}</div>}
        {title ? <div className="mt-1">{children}</div> : children}
      </div>
      {actions}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setIsVisible(false);
          onDismiss?.();
        }}
        className="-mr-2 ml-auto cursor-pointer px-2 py-1 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
