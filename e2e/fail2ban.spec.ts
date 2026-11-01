import { expect, test } from "@playwright/test";

const ADDRESS = "198.51.100.77";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/security/fail2ban");
  await expect(page.getByTestId("jail-sshd")).toBeVisible();
});

test("lists jails with counts, settings and banned addresses", async ({ page }) => {
  const sshd = page.getByTestId("jail-sshd");
  await expect(sshd).toContainText("3 banned");
  await expect(sshd).toContainText("5 tries / 10m");
  await expect(sshd).toContainText("1h");
  await expect(sshd.getByTestId("command-label")).toHaveText(/sudo fail2ban-client status sshd/);
  await expect(page.getByTestId("jail-nginx-http-auth")).toBeVisible();
});

test("the ban form previews the command", async ({ page }) => {
  const form = page.getByRole("form", { name: "Ban an address" });
  await expect(form.getByTestId("command-label")).toHaveText(/sudo fail2ban-client set sshd banip ADDRESS/);
  await form.getByLabel("Address").fill(ADDRESS);
  await expect(form.getByTestId("command-label")).toHaveText(new RegExp(`sudo fail2ban-client set sshd banip ${ADDRESS.replaceAll(".", String.raw`\.`)}`));
});

test("refuses something that is not an address", async ({ page }) => {
  const form = page.getByRole("form", { name: "Ban an address" });
  await form.getByLabel("Address").fill("10.0.0.0/8; reboot");
  await form.getByRole("button", { name: "Ban address" }).click();
  await expect(page.getByText(/Enter one IPv4 or IPv6 address/).first()).toBeVisible();
});

test("banning and unbanning an address", async ({ page }) => {
  const form = page.getByRole("form", { name: "Ban an address" });
  await form.getByLabel("Address").fill(ADDRESS);
  await form.getByRole("button", { name: "Ban address" }).click();
  const sshd = page.getByTestId("jail-sshd");
  const bannedRow = sshd.getByRole("listitem").filter({ hasText: ADDRESS });
  await expect(bannedRow).toBeVisible({ timeout: 30_000 });
  await expect(sshd).toContainText("4 banned");
  await expect(page.getByTestId("security-activity")).toContainText(`Ban ${ADDRESS} in sshd`);

  await bannedRow.getByRole("button", { name: "Unban" }).click();
  await expect(bannedRow).toHaveCount(0, { timeout: 30_000 });
  await expect(sshd).toContainText("3 banned");
  const activity = page.getByTestId("security-activity");
  await expect(activity).toContainText(`Unban ${ADDRESS} from sshd`);
  await activity.getByText("Commands and output").first().click();
  await expect(activity).toContainText(`sudo fail2ban-client set sshd unbanip ${ADDRESS}`);
});
