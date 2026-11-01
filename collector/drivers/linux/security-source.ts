import { randomBytes } from "node:crypto";
import fileSystem from "node:fs/promises";
import path from "node:path";
import { isProgramAvailable, readTextFile, runCommand } from "@/collector/drivers/linux/run-command";
import { parseUfwConfigurationFiles } from "@/collector/parsers/parse-ufw-status";
import { buildFail2banState, buildFirewallState } from "@/collector/security/build-security-state";
import type { HostActionResult, SecurityAction, SecurityState } from "@/lib/security/security-types";

/*
 * Talks to the root helper (host-action/): drops a request file in its inbox, starts the one unit
 * the polkit rule lets serverlab start, then reads the result from the outbox. Without the helper
 * (an older install), it falls back to what an unprivileged user can see.
 */

const EXCHANGE_DIRECTORY = "/run/serverlab-host-action";
const INBOX_DIRECTORY = path.join(EXCHANGE_DIRECTORY, "inbox");
const OUTBOX_DIRECTORY = path.join(EXCHANGE_DIRECTORY, "outbox");
const HELPER_UNIT = "serverlab-host-action.service";
const HELPER_TIMEOUT_MILLISECONDS = 120_000;
const HELPER_MISSING_MESSAGE = "The root helper for firewall and fail2ban changes is not installed. Re-run sudo ./deploy/install.sh to add it.";

async function isHelperInstalled(): Promise<boolean> {
  try {
    await fileSystem.access(INBOX_DIRECTORY, fileSystem.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs one request through the helper and returns its result. Never throws: a helper that is
 * missing or fails produces an unsuccessful result with a readable message.
 */
export async function runThroughHelper(requestId: string, action: SecurityAction): Promise<HostActionResult> {
  const failure = (errorMessage: string): HostActionResult => ({ requestId, isSuccessful: false, errorMessage, steps: [], finishedAt: Date.now() });
  if (!(await isHelperInstalled())) return failure(HELPER_MISSING_MESSAGE);
  await fileSystem.writeFile(path.join(INBOX_DIRECTORY, `${requestId}.json`), JSON.stringify({ requestId, action }), { flag: "wx", mode: 0o600 });
  const startOutput = await runCommand("systemctl", ["start", "--no-ask-password", HELPER_UNIT], HELPER_TIMEOUT_MILLISECONDS);
  const resultText = await readTextFile(path.join(OUTBOX_DIRECTORY, `${requestId}.json`));
  if (resultText === null) return failure(startOutput === null ? `systemctl could not start ${HELPER_UNIT}. Check the polkit rule and journalctl -u ${HELPER_UNIT}.` : `${HELPER_UNIT} ran but left no result. See journalctl -u ${HELPER_UNIT}.`);
  try {
    return JSON.parse(resultText) as HostActionResult;
  } catch {
    return failure(`${HELPER_UNIT} wrote an unreadable result.`);
  }
}

/** What an unprivileged process can tell without the helper: installed programs, UFW config files and the fail2ban unit state. */
async function readUnprivilegedState(helperMessage: string): Promise<SecurityState> {
  const [hasUfw, hasFail2ban, ufwConfiguration, ufwDefaults, fail2banActiveState] = await Promise.all([
    isProgramAvailable("ufw"),
    isProgramAvailable("fail2ban-client"),
    readTextFile("/etc/ufw/ufw.conf"),
    readTextFile("/etc/default/ufw"),
    runCommand("systemctl", ["is-active", "fail2ban.service"]).then((output) => output?.trim() ?? "inactive"),
  ]);
  const ufwStatus = ufwConfiguration === null ? null : parseUfwConfigurationFiles(ufwConfiguration, ufwDefaults);
  return {
    checkedAt: Date.now(),
    helper: "not-installed",
    helperMessage,
    firewall: hasUfw && ufwStatus ? { status: ufwStatus.status, defaults: ufwStatus.defaults, logging: ufwStatus.logging, rules: [], addedRules: [] } : { status: hasUfw ? "unknown" : "not-installed", defaults: null, logging: null, rules: [], addedRules: [] },
    fail2ban: { status: hasFail2ban ? (fail2banActiveState === "active" ? "running" : "stopped") : "not-installed", version: null, jails: [] },
  };
}

/** The current UFW and fail2ban state, read by the helper when it is installed. */
export async function readSecurityState(): Promise<SecurityState> {
  if (!(await isHelperInstalled())) return readUnprivilegedState(HELPER_MISSING_MESSAGE);
  const result = await runThroughHelper(`snapshot-${Date.now()}-${randomBytes(4).toString("hex")}`, { kind: "snapshot" });
  if (!result.isSuccessful) return { ...(await readUnprivilegedState(result.errorMessage ?? "The helper failed.")), helper: "failed" };
  const firewall = buildFirewallState(result.steps);
  if (firewall.status === "inactive" && !firewall.defaults) {
    /* `ufw status verbose` prints only "Status: inactive"; the policies that apply on enable are in the config files. */
    const ufwConfiguration = await readTextFile("/etc/ufw/ufw.conf");
    const fromFiles = ufwConfiguration === null ? null : parseUfwConfigurationFiles(ufwConfiguration, await readTextFile("/etc/default/ufw"));
    firewall.defaults = fromFiles?.defaults ?? null;
    firewall.logging = fromFiles?.logging ?? firewall.logging;
  }
  return { checkedAt: result.finishedAt, helper: "ready", helperMessage: null, firewall, fail2ban: buildFail2banState(result.steps) };
}
