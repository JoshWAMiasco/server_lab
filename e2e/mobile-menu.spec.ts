import { expect, test, type Page } from "@playwright/test";

/* While the drawer is open the rest of the page is inert, so the hamburger is found by its label, not its role. */
const hamburger = (page: Page) => page.locator('button[aria-label="Open menu"]');

const openMenu = async (page: Page) => {
  await hamburger(page).tap();
  const drawer = page.locator("#mobile-menu-drawer");
  await expect(drawer).toBeVisible();
  await expect(hamburger(page)).toHaveAttribute("aria-expanded", "true");
  return drawer;
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
});

test("the desktop side menu is hidden on phones", async ({ page }) => {
  await expect(page.getByRole("navigation", { name: "Main menu" })).toHaveCount(0);
  await expect(page.locator("#mobile-menu-drawer")).toHaveCount(0);
  await expect(hamburger(page)).toHaveAttribute("aria-expanded", "false");
});

test("tapping outside the drawer closes it", async ({ page }) => {
  const drawer = await openMenu(page);
  const viewport = page.viewportSize();
  await page.touchscreen.tap((viewport?.width ?? 400) - 20, (viewport?.height ?? 800) / 2);
  await expect(drawer).toBeHidden();
  await expect(hamburger(page)).toHaveAttribute("aria-expanded", "false");
});

test("tapping a link navigates and closes the drawer", async ({ page }) => {
  const drawer = await openMenu(page);
  await drawer.getByRole("link", { name: /Firewall/i }).tap();
  await expect(page).toHaveURL(/\/security\/firewall/);
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("heading", { name: "Firewall", exact: true })).toBeVisible();
});

test("the close button and Escape close the drawer", async ({ page }) => {
  let drawer = await openMenu(page);
  await page.getByRole("button", { name: "Close menu" }).tap();
  await expect(drawer).toBeHidden();
  drawer = await openMenu(page);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("the page behind the open drawer does not scroll", async ({ page }) => {
  await openMenu(page);
  const overflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
  expect(overflow).toBe("hidden");
});

test("every menu entry is reachable inside the drawer", async ({ page }) => {
  const drawer = await openMenu(page);
  for (const name of ["Lobby", "Resources", "Applications", "User Watcher", "Alerts", "Firewall", "fail2ban", "Settings"]) {
    const link = drawer.getByRole("link", { name: new RegExp(`^${name}`, "i") });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeInViewport();
  }
});
