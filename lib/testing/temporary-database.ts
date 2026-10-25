import fileSystem from "node:fs";
import operatingSystem from "node:os";
import path from "node:path";
import { openDatabase, type ServerLabDatabase } from "@/lib/database/client";

/**
 * A fresh, migrated database in a temporary directory, for tests. Call `remove()` afterwards.
 */
export function createTemporaryDatabase(): { database: ServerLabDatabase; remove: () => void } {
  const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "serverlab-test-"));
  const database = openDatabase(path.join(directory, "test.db"));
  return {
    database,
    remove: () => {
      database.$client.close();
      fileSystem.rmSync(directory, { recursive: true, force: true });
    },
  };
}
