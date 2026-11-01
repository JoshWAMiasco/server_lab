import { expect, test } from "@playwright/test";
import { DASHBOARD_PAGES } from "./test-constants";

for (const dashboardPage of DASHBOARD_PAGES) {
  test(`${dashboardPage.path} renders without errors and fits the screen`, async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    await page.goto(dashboardPage.path);
    await expect(page.getByRole("heading", { name: dashboardPage.heading, exact: true }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(widths.document, "no sideways scrolling").toBeLessThanOrEqual(widths.viewport + 1);
    expect(problems).toEqual([]);
  });
}

test("the live stream delivers samples", async ({ page }) => {
  await page.goto("/resources");
  const firstEvent = await page.evaluate(async () => {
    const response = await fetch("/api/stream");
    const reader = response.body?.getReader();
    if (!reader) return "";
    const decoder = new TextDecoder();
    let text = "";
    const deadline = Date.now() + 15_000;
    while (!text.includes("data:") && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    await reader.cancel();
    return text;
  });
  expect(firstEvent).toContain("data:");
});
