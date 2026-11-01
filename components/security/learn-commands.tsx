import { CommandLabel } from "@/components/security/command-label";

export interface LearnCommand {
  command: string;
  caption: string;
}

/**
 * A reference list of terminal commands, each with a one-line explanation and a copy button.
 *
 * @example
 * <LearnCommands commands={[{ command: "sudo ufw status verbose", caption: "Show everything." }]} />
 */
export function LearnCommands({ commands }: { commands: readonly LearnCommand[] }) {
  return (
    <ul className="grid gap-4">
      {commands.map((entry) => (
        <li key={entry.command}>
          <CommandLabel command={entry.command} caption={entry.caption} />
        </li>
      ))}
    </ul>
  );
}
