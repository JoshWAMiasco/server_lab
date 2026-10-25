import readline from "node:readline";
import { Writable } from "node:stream";
import { eq } from "drizzle-orm";
import { MINIMUM_PASSWORD_LENGTH, hashPassword } from "@/lib/authentication/password";
import { revokeOtherSessions } from "@/lib/authentication/session-store";
import { openDatabase, resolveDatabasePath } from "@/lib/database/client";
import { adminAccount } from "@/lib/schema/authentication";

const USAGE = `ServerLab admin CLI

  reset-password     Set a new admin password and sign out every session
  revoke-sessions    Sign out every session
  help               Show this text

Reads DATABASE_PATH (default ./data/serverlab.db).`;

/**
 * Asks questions on one shared readline interface (so piped input works) and hides what the user
 * types when stdin is a terminal.
 */
function createHiddenPrompter() {
  let isMuted = false;
  const mutableOutput = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!isMuted) process.stdout.write(chunk);
      callback();
    },
  });
  const lineReader = readline.createInterface({ input: process.stdin, output: mutableOutput, terminal: Boolean(process.stdin.isTTY) });
  const lineIterator = lineReader[Symbol.asyncIterator]();
  return {
    async ask(question: string): Promise<string> {
      process.stdout.write(question);
      isMuted = true;
      const { value, done } = await lineIterator.next();
      isMuted = false;
      process.stdout.write("\n");
      if (done) throw new Error("No input.");
      return String(value);
    },
    close: () => lineReader.close(),
  };
}

async function resetPassword() {
  const database = openDatabase();
  const prompter = createHiddenPrompter();
  const password = await prompter.ask(`New admin password (at least ${MINIMUM_PASSWORD_LENGTH} characters): `);
  if (password.length < MINIMUM_PASSWORD_LENGTH) throw new Error(`The password must have at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
  const repeated = await prompter.ask("Repeat it: ");
  prompter.close();
  if (repeated !== password) throw new Error("The passwords do not match.");
  const now = Date.now();
  const passwordHash = await hashPassword(password);
  const hasAdmin = Boolean(database.select({ id: adminAccount.id }).from(adminAccount).where(eq(adminAccount.id, 1)).get());
  if (hasAdmin) database.update(adminAccount).set({ passwordHash, updatedAt: now }).where(eq(adminAccount.id, 1)).run();
  else database.insert(adminAccount).values({ id: 1, passwordHash, createdAt: now, updatedAt: now }).run();
  revokeOtherSessions(database, null);
  console.log(`Admin password updated in ${resolveDatabasePath()}; every session was signed out.`);
}

async function main() {
  const [command] = process.argv.slice(2);
  if (command === "reset-password") return resetPassword();
  if (command === "revoke-sessions") {
    revokeOtherSessions(openDatabase(), null);
    console.log("Every session was signed out.");
    return;
  }
  console.log(USAGE);
  if (command && command !== "help") process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`serverlab: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
