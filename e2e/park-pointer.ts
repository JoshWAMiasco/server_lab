import { expect, type Page } from "@playwright/test";

/**
 * Moves the mouse to the bottom-right corner of the page, away from the side menu. Headless
 * Chromium starts with the pointer at (0, 0), which is over the collapsed side menu: the menu then
 * expands on hover and covers buttons near the left edge of the page, so clicks on them time out.
 */
export async function parkPointer(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.mouse.move(viewport.width - 10, viewport.height - 10);
  await expect(page.locator(".side-menu").first()).not.toHaveClass(/side-menu--on-hover/);
}
