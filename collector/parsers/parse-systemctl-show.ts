import type { ItemState } from "../types";

export interface SystemdUnitInformation {
  unit: string;
  description: string;
  state: ItemState;
  startedAt: number | null;
  mainProcessId: number | null;
  controlGroup: string | null;
}

function mapActiveState(activeState: string): ItemState {
  if (activeState === "active" || activeState === "reloading") return "running";
  if (activeState === "activating") return "starting";
  if (activeState === "failed") return "failed";
  if (activeState === "inactive" || activeState === "deactivating") return "exited";
  return "unknown";
}

function parseProperties(block: string): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex > 0) properties[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }
  return properties;
}

/*
 * `systemctl show --timestamp=unix -p Id,Description,ActiveState,ActiveEnterTimestamp,MainPID,ControlGroup <units…>`:
 * one `Key=value` block per unit, separated by blank lines. ActiveEnterTimestamp is `@<unix seconds>`.
 * ControlGroup is the unit's cgroup path relative to /sys/fs/cgroup. Template instances live in a
 * sub-slice (`/system.slice/system-postgresql.slice/postgresql@18-main.service`), so it must be
 * read rather than guessed.
 */
export function parseSystemctlShow(text: string): SystemdUnitInformation[] {
  return text
    .split(/\n\s*\n/)
    .map(parseProperties)
    .filter((properties) => properties.Id)
    .map((properties) => {
      const startSeconds = Number((properties.ActiveEnterTimestamp ?? "").replace(/^@/, ""));
      const mainProcessId = Number(properties.MainPID);
      return {
        unit: properties.Id as string,
        description: properties.Description ?? "",
        state: mapActiveState(properties.ActiveState ?? ""),
        startedAt: Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds * 1000 : null,
        mainProcessId: Number.isFinite(mainProcessId) && mainProcessId > 0 ? mainProcessId : null,
        controlGroup: properties.ControlGroup?.startsWith("/") ? properties.ControlGroup : null,
      };
    });
}
