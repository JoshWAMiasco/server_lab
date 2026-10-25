import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * Test-only helper: reads a fixture from collector/__fixtures__. It lives here rather than in that
 * directory because eslint's filename-case rule rejects `.ts` files inside `__fixtures__`.
 */
export function readFixture(fileName: string): string {
  return readFileSync(path.join(import.meta.dirname, "..", "__fixtures__", fileName), "utf8");
}
