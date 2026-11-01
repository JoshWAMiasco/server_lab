import { CopyToClipboardButton } from "@/components/interactive/copy-to-clipboard-button";
import { mergeClassNames } from "@/utilities/merge-class-names";

/**
 * The terminal command behind a control, shown under it so the page teaches the CLI. The text is
 * selectable and has a copy button; `caption` explains what the command does.
 *
 * @example
 * <CommandLabel command="sudo ufw allow in on tailscale0" caption="Lets everything in over Tailscale." />
 */
export function CommandLabel({ command, caption, className }: { command: string; caption?: string; className?: string }) {
  return (
    <div className={mergeClassNames("min-w-0", className)}>
      <div className="flex items-stretch border border-line bg-field">
        <code data-testid="command-label" className="min-w-0 flex-1 px-3 py-2 text-xs break-words whitespace-pre-wrap text-foreground">
          <span aria-hidden="true" className="mr-2 text-brand select-none">
            $
          </span>
          {command}
        </code>
        <CopyToClipboardButton appearance="icon-only" textToCopy={command} accessibleLabel="Copy command" className="h-auto w-9 flex-none border-0 border-l border-line" />
      </div>
      {caption && <p className="mt-1.5 text-xs leading-relaxed text-foreground-subtle">{caption}</p>}
    </div>
  );
}
