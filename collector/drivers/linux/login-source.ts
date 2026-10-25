import { spawn, type ChildProcess } from "node:child_process";
import fileSystem from "node:fs";
import readline from "node:readline";
import { isProgramAvailable, runCommand } from "@/collector/drivers/linux/run-command";
import { parseLastOutput } from "@/collector/parsers/parse-last-output";
import { parseSshdLine } from "@/collector/parsers/parse-sshd-line";
import type { ParsedLoginEvent } from "@/collector/types";

const JOURNAL_MATCHES = ["SYSLOG_IDENTIFIER=sshd", "+", "SYSLOG_IDENTIFIER=sshd-session", "+", "SYSLOG_IDENTIFIER=login"];
const AUTH_LOG_PATH = "/var/log/auth.log";
const RESTART_DELAY_MILLISECONDS = 5000;

interface JournalEntry {
  MESSAGE?: string | number[];
  SYSLOG_IDENTIFIER?: string;
  __REALTIME_TIMESTAMP?: string;
  __CURSOR?: string;
}

/**
 * Console (TTY) logins from `login`: "pam_unix(login:session): session opened for user X" and
 * "FAILED LOGIN (1) on '/dev/tty1' FOR 'root', Authentication failure".
 */
export function parseConsoleLoginLine(message: string, timestamp: number): ParsedLoginEvent | null {
  const openedMatch = /pam_unix\(login:session\): session opened for user (\S+?)(?:\(uid=\d+\))?\s/.exec(`${message} `);
  if (openedMatch?.[1]) return { timestamp, channel: "console", username: openedMatch[1], result: "success", method: "password", sourceAddress: null, sourcePort: null, raw: message };
  const failedMatch = /FAILED LOGIN \(\d+\) on '([^']+)' FOR '([^']+)'/.exec(message);
  if (failedMatch?.[2]) return { timestamp, channel: "console", username: failedMatch[2], result: "failure", method: "password", sourceAddress: null, sourcePort: null, raw: message };
  return null;
}

function decodeMessage(message: JournalEntry["MESSAGE"]): string {
  if (Array.isArray(message)) return Buffer.from(message).toString("utf8");
  return message ?? "";
}

function parseJournalEntry(entry: JournalEntry): ParsedLoginEvent | null {
  const message = decodeMessage(entry.MESSAGE);
  const timestamp = Math.floor(Number(entry.__REALTIME_TIMESTAMP ?? 0) / 1000) || Date.now();
  return entry.SYSLOG_IDENTIFIER === "login" ? parseConsoleLoginLine(message, timestamp) : parseSshdLine(message, timestamp);
}

/**
 * A syslog line from /var/log/auth.log, in the classic ("Oct 18 14:02:11 host sshd[1]: …") or the
 * RFC 3339 format Ubuntu 24.04+ uses ("2026-10-18T14:02:11.123+00:00 host sshd[1]: …").
 */
export function parseAuthLogLine(line: string, now = new Date()): ParsedLoginEvent | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\S+|\w{3}\s+\d{1,2} \d{2}:\d{2}:\d{2}) \S+ (sshd|sshd-session|login)(?:\[\d+\])?: (.*)$/.exec(line);
  if (!match) return null;
  const [, timeText = "", identifier, message = ""] = match;
  let timestamp = Date.parse(timeText);
  if (!/^\d{4}-/.test(timeText)) {
    timestamp = Date.parse(`${timeText} ${now.getFullYear()}`);
    if (timestamp > now.getTime() + 86_400_000) timestamp = Date.parse(`${timeText} ${now.getFullYear() - 1}`);
  }
  if (!Number.isFinite(timestamp)) return null;
  return identifier === "login" ? parseConsoleLoginLine(message, timestamp) : parseSshdLine(message, timestamp);
}

/**
 * Follows sshd and console sign-ins. Prefers `journalctl -f -o json` (cursor saved, so restarts
 * neither miss nor repeat lines); falls back to tailing /var/log/auth.log when the journal is not
 * readable (no `systemd-journal` group).
 */
export class LoginSource {
  private journalProcess: ChildProcess | null = null;
  private authLogWatcher: fileSystem.FSWatcher | null = null;
  private restartTimeout: NodeJS.Timeout | undefined;
  private isStopped = false;

  async canReadJournal(): Promise<boolean> {
    if (!(await isProgramAvailable("journalctl"))) return false;
    const output = await runCommand("journalctl", ["-n", "1", "-o", "json", "--no-pager", "SYSLOG_IDENTIFIER=sshd", "+", "SYSLOG_IDENTIFIER=sshd-session"], 5000);
    return output !== null;
  }

  watch({ resumeCursor, onLoginEvent, onCursor }: { resumeCursor: string | null; onLoginEvent: (loginEvent: ParsedLoginEvent) => void; onCursor: (cursor: string) => void }): void {
    void this.canReadJournal().then((canReadJournal) => {
      if (this.isStopped) return;
      if (canReadJournal) this.followJournal(resumeCursor, onLoginEvent, onCursor);
      else this.followAuthLog(onLoginEvent);
    });
  }

  private followJournal(resumeCursor: string | null, onLoginEvent: (loginEvent: ParsedLoginEvent) => void, onCursor: (cursor: string) => void): void {
    let lastCursor = resumeCursor;
    const start = () => {
      const journalArguments = ["-f", "-o", "json", "--no-pager", ...(lastCursor ? [`--after-cursor=${lastCursor}`] : ["-n", "0"]), ...JOURNAL_MATCHES];
      const journalProcess = spawn("journalctl", journalArguments, { stdio: ["ignore", "pipe", "ignore"] });
      this.journalProcess = journalProcess;
      const lines = readline.createInterface({ input: journalProcess.stdout });
      lines.on("line", (line) => {
        try {
          const entry = JSON.parse(line) as JournalEntry;
          const loginEvent = parseJournalEntry(entry);
          if (loginEvent) onLoginEvent(loginEvent);
          if (entry.__CURSOR) {
            lastCursor = entry.__CURSOR;
            onCursor(entry.__CURSOR);
          }
        } catch {
          /* Ignore partial or non-JSON lines. */
        }
      });
      journalProcess.on("exit", () => {
        if (this.isStopped) return;
        this.restartTimeout = setTimeout(start, RESTART_DELAY_MILLISECONDS);
      });
    };
    start();
  }

  private followAuthLog(onLoginEvent: (loginEvent: ParsedLoginEvent) => void): void {
    let position = 0;
    try {
      position = fileSystem.statSync(AUTH_LOG_PATH).size;
    } catch {
      console.error("[collector] Neither the journal nor /var/log/auth.log is readable; SSH logins will not be recorded.");
      return;
    }
    const readNewLines = () => {
      let size: number;
      try {
        size = fileSystem.statSync(AUTH_LOG_PATH).size;
      } catch {
        return;
      }
      if (size < position) position = 0;
      if (size === position) return;
      const stream = fileSystem.createReadStream(AUTH_LOG_PATH, { start: position, end: size - 1, encoding: "utf8" });
      position = size;
      readline.createInterface({ input: stream }).on("line", (line) => {
        const loginEvent = parseAuthLogLine(line);
        if (loginEvent) onLoginEvent(loginEvent);
      });
    };
    this.authLogWatcher = fileSystem.watch(AUTH_LOG_PATH, readNewLines);
    this.restartTimeout = setInterval(readNewLines, 5000);
  }

  /**
   * History that existed before ServerLab: the journal since `sinceTimestamp`, then wtmp (`last`,
   * or `wtmpdb last` on newer releases) and btmp (`lastb`) for anything older than the journal.
   */
  async readHistory(sinceTimestamp: number): Promise<{ events: ParsedLoginEvent[]; source: string }> {
    const events: ParsedLoginEvent[] = [];
    const sources: string[] = [];
    const journalOutput = await runCommand("journalctl", ["-o", "json", "--no-pager", `--since=@${Math.floor(sinceTimestamp / 1000)}`, ...JOURNAL_MATCHES], 120_000);
    if (journalOutput) {
      sources.push("journal");
      for (const line of journalOutput.split("\n")) {
        try {
          const loginEvent = parseJournalEntry(JSON.parse(line) as JournalEntry);
          if (loginEvent) events.push(loginEvent);
        } catch {
          /* Skip malformed lines. */
        }
      }
    }
    const oldestJournalTimestamp = events.reduce((oldest, loginEvent) => Math.min(oldest, loginEvent.timestamp), Number.POSITIVE_INFINITY);
    const isOlderThanJournal = (loginEvent: ParsedLoginEvent) => loginEvent.timestamp >= sinceTimestamp && loginEvent.timestamp < oldestJournalTimestamp;
    const lastOutput = (await isProgramAvailable("last")) ? await runCommand("last", ["-F", "-i", "-w"]) : (await isProgramAvailable("wtmpdb")) ? await runCommand("wtmpdb", ["last", "-F", "-i", "-w"]) : null;
    if (lastOutput) {
      sources.push("wtmp");
      events.push(...parseLastOutput(lastOutput, false).filter(isOlderThanJournal));
    }
    const lastbOutput = (await isProgramAvailable("lastb")) ? await runCommand("lastb", ["-F", "-i", "-w"]) : null;
    if (lastbOutput) {
      sources.push("btmp");
      events.push(...parseLastOutput(lastbOutput, true).filter(isOlderThanJournal));
    }
    return { events, source: sources.join("+") || "none" };
  }

  stop(): void {
    this.isStopped = true;
    this.journalProcess?.kill();
    this.authLogWatcher?.close();
    clearTimeout(this.restartTimeout);
    clearInterval(this.restartTimeout);
  }
}
