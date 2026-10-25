/*
 * Browser smoke test against a running ServerLab (dev or production).
 *
 *   SERVERLAB_PASSWORD='…' node scripts/smoke-test.mjs
 *
 * Environment: BASE_URL (default http://localhost:3000), SERVERLAB_PASSWORD (required),
 * BROWSER_CHANNEL ("chrome" to use an installed Google Chrome; empty uses Playwright's Chromium,
 * install it with `npx playwright-core install chromium`), SCREENSHOT_DIRECTORY (optional).
 * Exits 1 when any step fails. It signs in and out but never changes settings or data, except
 * for recording its own sign-in attempts in the User Watcher.
 */
import fileSystem from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const password = process.env.SERVERLAB_PASSWORD;
const screenshotDirectory = process.env.SCREENSHOT_DIRECTORY;
if (!password) {
  console.error("Set SERVERLAB_PASSWORD to the admin password.");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: false });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(`${page.url()}: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") pageErrors.push(`${page.url()}: ${message.text()}`);
});
let failureCount = 0;

async function step(name, action) {
  try {
    await action();
    console.log(`ok    ${name}`);
  } catch (error) {
    failureCount += 1;
    console.log(`FAIL  ${name}: ${String(error).split("\n")[0]}`);
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/fail-${name.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {});
  }
}

await step("protected page redirects to /login", async () => {
  await page.goto(`${baseUrl}/resources`);
  await page.waitForURL(/\/login\?next=/);
});
await step("API stream refuses anonymous requests", async () => {
  const response = await page.request.get(`${baseUrl}/api/stream`);
  if (response.status() !== 401) throw new Error(`status ${response.status()}`);
});
await step("security headers are present", async () => {
  const response = await page.request.get(`${baseUrl}/login`);
  const headers = response.headers();
  for (const header of ["content-security-policy", "x-frame-options", "referrer-policy", "x-content-type-options"]) if (!headers[header]) throw new Error(`missing ${header}`);
  if (headers["x-powered-by"]) throw new Error("x-powered-by is exposed");
});
await step("open redirect is blocked", async () => {
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent("/\\evil.example")}`);
  await page.fill("#field-password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((url) => url.origin === new URL(baseUrl).origin && url.pathname === "/", { timeout: 20_000 });
});
await step("sign out", async () => {
  await page.getByLabel("Admin menu").click();
  await page.getByText("Sign out").click();
  await page.waitForURL(/\/login/);
});
await step("wrong password is rejected", async () => {
  await page.fill("#field-password", "not the password");
  await page.click("button[type=submit]");
  await page.getByText(/Wrong password|Locked/).waitFor({ timeout: 10_000 });
});
await step("password field toggles visibility", async () => {
  const field = page.locator("#field-password");
  await page.getByRole("button", { name: "Show password" }).click();
  if ((await field.getAttribute("type")) !== "text") throw new Error("still hidden");
  await page.getByRole("button", { name: "Hide password" }).click();
});
await step("sign in lands on ?next", async () => {
  await page.goto(`${baseUrl}/login?next=%2Fwatcher`);
  await page.fill("#field-password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/watcher/, { timeout: 20_000 });
});

const pages = [
  ["/", "Everything hosted on"],
  ["/resources", "Live host metrics"],
  ["/resources?range=7d", "History from"],
  ["/apps", "Total tracked"],
  ["/watcher?range=24h", "Logins over time"],
  ["/alerts", "Rules ("],
  ["/settings", "Active sessions"],
];
for (const [path, expectedText] of pages) {
  await step(`page ${path} renders`, async () => {
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) throw new Error(`status ${response?.status()}`);
    await page.getByText(expectedText).first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/${path.replace(/\W+/g, "-") || "lobby"}.png`, fullPage: true });
  });
}
await step("live stream delivers system samples", async () => {
  const receivedTopics = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const topics = new Set();
        const source = new EventSource("/api/stream");
        for (const topic of ["system", "status"]) source.addEventListener(topic, () => topics.add(topic));
        setTimeout(() => {
          source.close();
          resolve([...topics]);
        }, 7000);
      }),
  );
  if (!receivedTopics.includes("system")) throw new Error(`received ${JSON.stringify(receivedTopics)}; is the collector running?`);
});
await step("no browser errors", async () => {
  if (pageErrors.length > 0) throw new Error(pageErrors.slice(0, 5).join(" | "));
});

await browser.close();
if (screenshotDirectory) fileSystem.writeFileSync(`${screenshotDirectory}/page-errors.txt`, pageErrors.join("\n"));
console.log(failureCount === 0 ? "\nAll smoke checks passed." : `\n${failureCount} smoke check(s) failed.`);
process.exit(failureCount === 0 ? 0 : 1);
