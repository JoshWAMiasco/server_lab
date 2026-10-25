import fileSystem from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as tables from "@/lib/schema/tables";
import { readEnvironment } from "@/lib/environment";

export type ServerLabDatabase = BetterSQLite3Database<typeof tables> & { $client: Database.Database };

const DEFAULT_DATABASE_PATH = "./data/serverlab.db";

const globalForDatabase = globalThis as unknown as { serverLabDatabase?: ServerLabDatabase };

/**
 * Where the SQLite file lives: `DATABASE_PATH`, or `./data/serverlab.db` during development.
 */
export function resolveDatabasePath(): string {
  // eslint-disable-next-line no-inline-comments -- tells Next not to trace this runtime-only path
  return path.resolve(/*turbopackIgnore: true*/ readEnvironment("DATABASE_PATH") ?? DEFAULT_DATABASE_PATH);
}

/**
 * Opens a database file with ServerLab's PRAGMAs and applies pending migrations. Both the web
 * process and the collector call it; migrations are idempotent and serialized by SQLite's lock.
 */
export function openDatabase(databasePath = resolveDatabasePath()): ServerLabDatabase {
  fileSystem.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const connection = new Database(databasePath);
  const isNewDatabase = connection.pragma("page_count", { simple: true }) === 0;
  if (isNewDatabase) connection.pragma("auto_vacuum = INCREMENTAL");
  connection.pragma("journal_mode = WAL");
  connection.pragma("synchronous = NORMAL");
  connection.pragma("busy_timeout = 5000");
  connection.pragma("foreign_keys = ON");
  const database = drizzle(connection, { schema: tables }) as ServerLabDatabase;
  migrate(database, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  try {
    fileSystem.chmodSync(databasePath, 0o600);
  } catch {
    /* Not the owner (for example a read-only mount); leave permissions alone. */
  }
  return database;
}

/**
 * The process-wide database, opened lazily on first use. Survives Next.js dev reloads.
 */
export function getDatabase(): ServerLabDatabase {
  globalForDatabase.serverLabDatabase ??= openDatabase();
  return globalForDatabase.serverLabDatabase;
}
