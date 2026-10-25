import type { LoginChannel, ParsedLoginEvent } from "../types";

/*
 * Parses `last -F -i -w` (wtmp, successful sessions) or `lastb -F -i -w` (btmp, failed attempts).
 * Line shape: `user tty host Sat Oct 18 14:02:11 2026 - Sat Oct 18 15:00:02 2026 (00:57)`.
 *
 * - `reboot` / `shutdown` / `runlevel` pseudo-users and the `wtmp begins …` footer are skipped.
 * - `-i` prints `0.0.0.0` (or `::`) for local sessions; that becomes a null address.
 * - The channel follows the tty: `tty*`, `:0`, `seat*` and `console` are `console`; `pts/*` and
 *   `ssh:notty` are `ssh`.
 * - The login time is printed in the server's local time zone without an offset, so it is
 *   interpreted in the local time zone of this process. The collector runs on that server, so they
 *   agree.
 * - wtmp/btmp do not record the authentication method or the source port: method is `unknown`
 *   and sourcePort is null. Every lastb row is a `failure` (btmp cannot tell invalid users apart).
 */

const SKIPPED_USERS = new Set(["reboot", "shutdown", "runlevel"]);
const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TIME_OF_DAY = /^(\d{1,2}):(\d{2}):(\d{2})$/;
const YEAR = /^\d{4}$/;
const LOCAL_ADDRESSES = new Set(["0.0.0.0", "::", ""]);

function findDateIndex(tokens: string[]): number {
  for (let tokenIndex = 2; tokenIndex + 4 < tokens.length; tokenIndex += 1) {
    if (
      WEEKDAYS.has(tokens[tokenIndex] ?? "") &&
      MONTHS.includes(tokens[tokenIndex + 1] ?? "") &&
      TIME_OF_DAY.test(tokens[tokenIndex + 3] ?? "") &&
      YEAR.test(tokens[tokenIndex + 4] ?? "")
    ) {
      return tokenIndex;
    }
  }
  return -1;
}

function parseLocalDate(month: string, day: string, timeOfDay: string, year: string): number {
  const [, hours, minutes, seconds] = TIME_OF_DAY.exec(timeOfDay) ?? [];
  return new Date(
    Number(year),
    MONTHS.indexOf(month),
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  ).getTime();
}

function channelForTerminal(terminal: string): LoginChannel {
  return terminal.startsWith("pts/") || terminal.startsWith("ssh") ? "ssh" : "console";
}

export function parseLastOutput(text: string, isFailedLogins: boolean): ParsedLoginEvent[] {
  const events: ParsedLoginEvent[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const tokens = line.split(/\s+/);
    const [username = "", terminal = ""] = tokens;
    if (!line || SKIPPED_USERS.has(username) || tokens[1] === "begins") {
      continue;
    }
    const dateIndex = findDateIndex(tokens);
    if (dateIndex === -1) {
      continue;
    }
    const [, month = "", day = "", timeOfDay = "", year = ""] = tokens.slice(dateIndex, dateIndex + 5);
    const host = tokens.slice(2, dateIndex).join(" ");
    events.push({
      timestamp: parseLocalDate(month, day, timeOfDay, year),
      channel: channelForTerminal(terminal),
      username,
      result: isFailedLogins ? "failure" : "success",
      method: "unknown",
      sourceAddress: LOCAL_ADDRESSES.has(host) ? null : host,
      sourcePort: null,
      raw: line,
    });
  }
  return events;
}
