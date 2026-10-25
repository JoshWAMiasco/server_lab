"use client";

import { Check, File } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createButtonClassNames } from "@/components/primitives/button";
import { mergeClassNames } from "@/utilities/merge-class-names";

interface CopyToClipboardButtonBaseProps {
  textToCopy: string;
  className?: string;
}

export interface LabeledCopyToClipboardButtonProps extends CopyToClipboardButtonBaseProps {
  appearance?: "labeled";
  label?: ReactNode;
  copiedLabel?: ReactNode;
}

export interface IconOnlyCopyToClipboardButtonProps extends CopyToClipboardButtonBaseProps {
  appearance: "icon-only";
  accessibleLabel: string;
  copiedAccessibleLabel?: string;
}

export type CopyToClipboardButtonProps = LabeledCopyToClipboardButtonProps | IconOnlyCopyToClipboardButtonProps;

const COPIED_STATE_DURATION_IN_MILLISECONDS = 1500;

/**
 * A small outline button that copies `textToCopy` and briefly shows a confirmation. The default
 * `appearance="labeled"` shows an icon and text; `appearance="icon-only"` shows just the icon and
 * requires `accessibleLabel`, which screen readers announce instead of the missing text.
 *
 * @example
 * <CopyToClipboardButton textToCopy={exampleCode} label="Copy example code" />
 * <CopyToClipboardButton appearance="icon-only" textToCopy={apiKey} accessibleLabel="Copy API key" />
 */
export function CopyToClipboardButton(copyToClipboardButtonProps: CopyToClipboardButtonProps) {
  const { textToCopy, className } = copyToClipboardButtonProps;
  const [hasCopied, setHasCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(textToCopy);
    setHasCopied(true);
    window.setTimeout(() => setHasCopied(false), COPIED_STATE_DURATION_IN_MILLISECONDS);
  };

  if (copyToClipboardButtonProps.appearance === "icon-only") {
    const { accessibleLabel, copiedAccessibleLabel = "Copied!" } = copyToClipboardButtonProps;
    return (
      <button
        type="button"
        onClick={handleCopy}
        aria-label={hasCopied ? copiedAccessibleLabel : accessibleLabel}
        title={accessibleLabel}
        className={createButtonClassNames({ variant: "outline-secondary", className: mergeClassNames("h-8 w-8 p-0", className) })}
      >
        {hasCopied ? <Check aria-hidden="true" className="h-4 w-4 stroke-[1.3]" /> : <File aria-hidden="true" className="h-4 w-4 stroke-[1.3]" />}
        <span className="sr-only" aria-live="polite">
          {hasCopied ? copiedAccessibleLabel : ""}
        </span>
      </button>
    );
  }

  const { label = "Copy example code", copiedLabel = "Copied!" } = copyToClipboardButtonProps;
  return (
    <button type="button" onClick={handleCopy} className={createButtonClassNames({ variant: "outline-secondary", className: mergeClassNames("px-2 py-1", className) })}>
      {hasCopied ? <Check className="mr-2 h-4 w-4 stroke-[1]" /> : <File className="mr-2 h-4 w-4 stroke-[1]" />}
      {hasCopied ? copiedLabel : label}
    </button>
  );
}
