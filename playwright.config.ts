import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests against a throwaway ServerLab (scripts/end-to-end-server.mjs: mock collector, fresh
 * database). Run `npm run build` once, then `npm run test:e2e`. Set E2E_DEV=1 to test `next dev`
 * instead, and PLAYWRIGHT_CHROMIUM_PATH to use a Chromium that is already installed.
 *
 * Tests share one server and one database, so they run one at a time: setup creates the admin
 * account, then the desktop and mobile projects reuse its session.
 */
const port = process.env.E2E_PORT ?? "3200";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  webServer: {
    command: "node scripts/end-to-end-server.mjs",
    url: `http://127.0.0.1:${port}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    { name: "setup", testMatch: /setup\.spec\.ts/ },
    { name: "desktop", testIgnore: /(setup|mobile-.*)\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "e2e/.auth/admin.json" } },
    { name: "mobile", testMatch: /(mobile-.*|pages)\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Pixel 7"], storageState: "e2e/.auth/admin.json" } },
  ],
});
