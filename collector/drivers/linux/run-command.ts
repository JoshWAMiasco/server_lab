import { execFile } from "node:child_process";
import fileSystem from "node:fs/promises";

const DEFAULT_TIMEOUT_MILLISECONDS = 8000;
const MAXIMUM_OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * Runs a program (never through a shell) and resolves its stdout, or null when it is missing,
 * fails or times out.
 */
export function runCommand(program: string, commandArguments: readonly string[], timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(program, commandArguments, { timeout: timeoutMilliseconds, maxBuffer: MAXIMUM_OUTPUT_BYTES, env: { ...process.env, LC_ALL: "C" } }, (error, stdout) => {
      resolve(error ? null : stdout);
    });
  });
}

/**
 * Whether an executable named `program` exists in a PATH directory (no shell involved).
 */
export async function isProgramAvailable(program: string): Promise<boolean> {
  if (!/^[\w.-]+$/.test(program)) return false;
  const directories = (process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin").split(":").filter(Boolean);
  for (const directory of directories) {
    try {
      await fileSystem.access(`${directory}/${program}`, fileSystem.constants.X_OK);
      return true;
    } catch {
      /* Not in this directory. */
    }
  }
  return false;
}

/**
 * Reads a text file, or null when it is missing or unreadable.
 */
export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fileSystem.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Reads a file holding one integer (sysfs style), or null.
 */
export async function readIntegerFile(filePath: string): Promise<number | null> {
  const text = await readTextFile(filePath);
  if (text === null) return null;
  const value = Number.parseInt(text.trim(), 10);
  return Number.isFinite(value) ? value : null;
}
