import { parseFail2banJailList } from "@/collector/parsers/parse-fail2ban-status";
import { parseUfwStatusNumbered } from "@/collector/parsers/parse-ufw-status";
import { buildActionCommands, buildJailSnapshotCommands, formatCommandLine, SNAPSHOT_BASE_COMMANDS, type HostCommand } from "@/lib/security/security-commands";
import type { CommandStep, SecurityAction } from "@/lib/security/security-types";
import { normalizeRuleText } from "@/lib/security/security-validation";

/** Runs one program without a shell. `exitCode` is null when it could not start (not installed) or timed out. */
export type ProgramRunner = (command: HostCommand) => Promise<{ exitCode: number | null; output: string }>;

export const PROGRAM_NOT_FOUND_OUTPUT = "command not found";
const MAXIMUM_STEP_OUTPUT_LENGTH = 16_000;
const MAXIMUM_SNAPSHOT_JAILS = 40;

async function runStep(runProgram: ProgramRunner, command: HostCommand): Promise<CommandStep> {
  const { exitCode, output } = await runProgram(command);
  return { commandLine: formatCommandLine(command), exitCode, output: output.trim().slice(0, MAXIMUM_STEP_OUTPUT_LENGTH) };
}

export interface ExecutedAction {
  isSuccessful: boolean;
  errorMessage: string | null;
  steps: CommandStep[];
}

/**
 * Carries out one validated action with `runProgram`. A snapshot runs every read-only command and
 * always succeeds (the steps say what is missing); a change stops at the first failing command.
 * Deleting a firewall rule first re-reads the numbered rules and refuses if rule N is no longer
 * the rule the admin chose, since numbers shift when rules are added or removed.
 */
export async function executeHostAction(action: SecurityAction, runProgram: ProgramRunner): Promise<ExecutedAction> {
  if (action.kind === "snapshot") {
    const steps: CommandStep[] = [];
    for (const command of SNAPSHOT_BASE_COMMANDS) steps.push(await runStep(runProgram, command));
    const jailListStep = steps.find((step) => step.commandLine === "sudo fail2ban-client status");
    const jails = jailListStep?.exitCode === 0 ? parseFail2banJailList(jailListStep.output).slice(0, MAXIMUM_SNAPSHOT_JAILS) : [];
    for (const jail of jails) for (const command of buildJailSnapshotCommands(jail)) steps.push(await runStep(runProgram, command));
    return { isSuccessful: true, errorMessage: null, steps };
  }

  const steps: CommandStep[] = [];
  if (action.kind === "firewall-delete-rule") {
    const listStep = await runStep(runProgram, { program: "ufw", commandArguments: ["status", "numbered"] });
    steps.push(listStep);
    const currentRule = parseUfwStatusNumbered(listStep.output).find((rule) => rule.number === action.ruleNumber);
    if (!currentRule || currentRule.ruleText !== normalizeRuleText(action.expectedRuleText)) {
      return { isSuccessful: false, errorMessage: `Rule ${action.ruleNumber} changed since the page loaded, so nothing was deleted. Refresh and try again.`, steps };
    }
  }
  for (const command of buildActionCommands(action)) {
    const step = await runStep(runProgram, command);
    steps.push(step);
    if (step.exitCode !== 0) {
      const reason = step.exitCode === null && step.output === PROGRAM_NOT_FOUND_OUTPUT ? `${command.program} is not installed.` : step.output.split("\n").find((line) => line.trim()) || `exit code ${step.exitCode ?? "unknown"}`;
      return { isSuccessful: false, errorMessage: `${step.commandLine} failed: ${reason}`, steps };
    }
  }
  return { isSuccessful: true, errorMessage: null, steps };
}
