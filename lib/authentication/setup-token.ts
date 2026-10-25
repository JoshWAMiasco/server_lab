import { randomBytes, timingSafeEqual } from "node:crypto";
import fileSystem from "node:fs";
import path from "node:path";
import { resolveDatabasePath } from "@/lib/database/client";
import { readEnvironment } from "@/lib/environment";

/**
 * Where the one-time setup token lives: `SETUP_TOKEN_PATH`, or `setup-token` next to the database.
 */
export function resolveSetupTokenPath(): string {
  return readEnvironment("SETUP_TOKEN_PATH") ?? path.join(path.dirname(resolveDatabasePath()), "setup-token");
}

/**
 * Reads the setup token. In development it is created (and printed) when missing, so `/setup`
 * works without running `install.sh`.
 */
export function readSetupToken(): string | null {
  const tokenPath = resolveSetupTokenPath();
  try {
    // eslint-disable-next-line no-inline-comments -- tells Next not to trace this runtime-only path
    return fileSystem.readFileSync(/*turbopackIgnore: true*/ tokenPath, "utf8").trim() || null;
  } catch {
    if (process.env.NODE_ENV === "production") return null;
    const developmentToken = randomBytes(12).toString("base64url");
    fileSystem.mkdirSync(path.dirname(tokenPath), { recursive: true });
    fileSystem.writeFileSync(tokenPath, developmentToken, { mode: 0o600 });
    console.log(`[serverlab] Development setup token (also in ${tokenPath}): ${developmentToken}`);
    return developmentToken;
  }
}

/**
 * Compares a submitted token with the stored one in constant time.
 */
export function isSetupTokenValid(submittedToken: string): boolean {
  const expectedToken = readSetupToken();
  if (!expectedToken) return false;
  const expectedBuffer = Buffer.from(expectedToken);
  const submittedBuffer = Buffer.from(submittedToken.trim());
  return expectedBuffer.length === submittedBuffer.length && timingSafeEqual(expectedBuffer, submittedBuffer);
}

/**
 * Deletes the token file once the admin exists and leaves the `.setup-complete` marker that
 * install.sh checks before ever generating a new token.
 */
export function completeSetupToken(): void {
  const tokenPath = resolveSetupTokenPath();
  fileSystem.rmSync(tokenPath, { force: true });
  try {
    fileSystem.writeFileSync(path.join(path.dirname(resolveDatabasePath()), ".setup-complete"), `${new Date().toISOString()}\n`, { mode: 0o600 });
  } catch {
    /* The marker is a convenience for install.sh; the admin row is the source of truth. */
  }
}
