import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, AUTHENTICATION_STATE_PATH, SETUP_TOKEN } from "./test-constants";

test.describe.configure({ mode: "serial" });

test("a fresh install sends every page to /setup", async ({ page }) => {
  await page.goto("/resources");
  await expect(page).toHaveURL(/\/setup/);
});

test("setup rejects a wrong token", async ({ page }) => {
  await page.goto("/setup");
  await page.fill("#field-setupToken", "not-the-token");
  await page.fill("#field-password", ADMIN_PASSWORD);
  await page.fill("#field-passwordConfirmation", ADMIN_PASSWORD);
  await page.click("button[type=submit]");
  await expect(page.getByText("The setup token is not valid.")).toBeVisible();
});

test("setup creates the admin and signs in", async ({ page }) => {
  await page.goto("/setup");
  await page.fill("#field-setupToken", SETUP_TOKEN);
  await page.fill("#field-password", ADMIN_PASSWORD);
  await page.fill("#field-passwordConfirmation", ADMIN_PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
  await page.context().storageState({ path: AUTHENTICATION_STATE_PATH });
});

test("sign out, a wrong password, and signing back in", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#field-password", "not the password");
  await page.click("button[type=submit]");
  await expect(page.getByText(/Wrong password|Locked/)).toBeVisible();
  await page.fill("#field-password", ADMIN_PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((url) => url.pathname === "/");
  await page.getByLabel("Admin menu").click();
  await page.getByText("Sign out").click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/security/firewall");
  await expect(page).toHaveURL(/\/login\?next=/);
});
