import { PROGRAM_NOT_FOUND_OUTPUT } from "@/host-action/execute-host-action";
import { parseFail2banJailList, parseFail2banJailStatus, parseFail2banNumber, parseFail2banVersion } from "@/collector/parsers/parse-fail2ban-status";
import { parseUfwShowAdded, parseUfwStatusNumbered, parseUfwStatusVerbose } from "@/collector/parsers/parse-ufw-status";
import type { CommandStep, Fail2banState, FirewallState } from "@/lib/security/security-types";

/*
 * Turns the helper's read-only snapshot (a list of command steps) into the state the pages show.
 * A program that is not installed comes back with exitCode null and "command not found".
 */

const findStep = (steps: readonly CommandStep[], commandLine: string) => steps.find((step) => step.commandLine === commandLine);
const isMissing = (step: CommandStep | undefined) => step?.exitCode === null && step.output === PROGRAM_NOT_FOUND_OUTPUT;

/** The firewall part of a snapshot. */
export function buildFirewallState(steps: readonly CommandStep[]): FirewallState {
  const verboseStep = findStep(steps, "sudo ufw status verbose");
  if (!verboseStep || isMissing(verboseStep)) return { status: verboseStep ? "not-installed" : "unknown", defaults: null, logging: null, rules: [], addedRules: [] };
  const verbose = parseUfwStatusVerbose(verboseStep.output);
  const numberedStep = findStep(steps, "sudo ufw status numbered");
  const addedStep = findStep(steps, "sudo ufw show added");
  return {
    status: verbose.status,
    defaults: verbose.defaults,
    logging: verbose.logging,
    rules: numberedStep?.exitCode === 0 ? parseUfwStatusNumbered(numberedStep.output) : [],
    addedRules: addedStep?.exitCode === 0 ? parseUfwShowAdded(addedStep.output) : [],
  };
}

/** The fail2ban part of a snapshot. A failing `fail2ban-client status` means the server is not running. */
export function buildFail2banState(steps: readonly CommandStep[]): Fail2banState {
  const versionStep = findStep(steps, "sudo fail2ban-client version");
  const statusStep = findStep(steps, "sudo fail2ban-client status");
  if (isMissing(versionStep) || isMissing(statusStep)) return { status: "not-installed", version: null, jails: [] };
  if (!statusStep) return { status: "unknown", version: null, jails: [] };
  if (statusStep.exitCode !== 0) return { status: "stopped", version: versionStep?.exitCode === 0 ? parseFail2banVersion(versionStep.output) : null, jails: [] };
  const jails = parseFail2banJailList(statusStep.output).map((jailName) => {
    const jailStep = findStep(steps, `sudo fail2ban-client status ${jailName}`);
    const readNumber = (setting: string) => {
      const step = findStep(steps, `sudo fail2ban-client get ${jailName} ${setting}`);
      return step?.exitCode === 0 ? parseFail2banNumber(step.output) : null;
    };
    return { ...parseFail2banJailStatus(jailName, jailStep?.exitCode === 0 ? jailStep.output : ""), banTimeSeconds: readNumber("bantime"), findTimeSeconds: readNumber("findtime"), maximumRetries: readNumber("maxretry") };
  });
  return { status: "running", version: versionStep?.exitCode === 0 ? parseFail2banVersion(versionStep.output) : null, jails };
}
