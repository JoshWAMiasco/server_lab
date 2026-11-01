/*
 * Starts ServerLab for the Playwright suite (playwright.config.ts runs it): a fresh database in a
 * temporary directory, a known setup token, the mock collector, and the web app on E2E_PORT.
 * The web app is the production build (run `npm run build` first) unless E2E_DEV=1, which uses
 * `next dev`. Everything is removed when Playwright stops the server.
 */
import { spawn } from "node:child_process";
import fileSystem from "node:fs";
import operatingSystem from "node:os";
import path from "node:path";

const port = process.env.E2E_PORT ?? "3200";
const setupToken = process.env.E2E_SETUP_TOKEN ?? "e2e-setup-token";
const isDevelopmentServer = process.env.E2E_DEV === "1";
const dataDirectory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "serverlab-e2e-"));

const environment = {
  ...process.env,
  COLLECTOR_DRIVER: "mock",
  DATABASE_PATH: path.join(dataDirectory, "serverlab.db"),
  SETUP_TOKEN_PATH: path.join(dataDirectory, "setup-token"),
  SESSION_SECRET: "e2e-session-secret-not-for-production",
  COOKIE_SECURE: "false",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: isDevelopmentServer ? "development" : "production",
};
fileSystem.writeFileSync(environment.SETUP_TOKEN_PATH, `${setupToken}\n`);

if (!isDevelopmentServer && !fileSystem.existsSync(".next/BUILD_ID")) {
  console.error("[e2e] No production build. Run `npm run build` first, or set E2E_DEV=1.");
  process.exit(1);
}

/*
 * The binaries run directly (not through npx), so each child is the real process and forwards
 * signals to anything it starts. They stay in this script's process group, which Playwright
 * stops as a whole when the tests end.
 */
const startChild = (program, programArguments) => spawn(path.join("node_modules", ".bin", program), programArguments, { env: environment, stdio: "inherit" });
const children = [startChild("tsx", ["collector/index.ts"]), startChild("next", [isDevelopmentServer ? "dev" : "start", "-H", "127.0.0.1", "-p", port])];

let isStopping = false;
const stop = (exitCode) => {
  if (isStopping) return;
  isStopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => {
    fileSystem.rmSync(dataDirectory, { recursive: true, force: true });
    process.exit(exitCode);
  }, 1500);
};
for (const child of children) child.on("exit", (code) => !isStopping && stop(code ?? 1));
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
console.log(`[e2e] data in ${dataDirectory}, web on http://127.0.0.1:${port}`);
