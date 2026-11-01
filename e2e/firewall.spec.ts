import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/security/firewall");
  await expect(page.getByTestId("firewall-status")).toHaveText(/active/i);
});

test("shows status, policies and numbered rules with their commands", async ({ page }) => {
  await expect(page.getByText("Development data")).toBeVisible();
  await expect(page.getByTestId("firewall-rules").getByRole("row")).toHaveCount(6);
  await expect(page.getByTestId("command-label").filter({ hasText: "sudo ufw status numbered" }).first()).toBeVisible();
  await expect(page.getByTestId("command-label").filter({ hasText: "sudo ufw disable" })).toBeVisible();
  await expect(page.getByTestId("command-label").filter({ hasText: "sudo ufw default deny incoming" })).toBeVisible();
});

test("the add-rule preview follows the form", async ({ page }) => {
  const form = page.getByRole("form", { name: "Add a firewall rule" });
  const preview = form.getByTestId("command-label").first();
  await page.getByLabel("Port or range").fill("8443");
  await page.getByLabel("From").fill("192.168.1.0/24");
  await page.getByLabel("Comment").fill("e2e lan https");
  await expect(preview).toHaveText(/sudo ufw allow in proto tcp from 192\.168\.1\.0\/24 to any port 8443 comment 'e2e lan https'/);
  await form.getByRole("button", { name: "Everything over Tailscale" }).click();
  await expect(preview).toHaveText(/sudo ufw allow in on tailscale0 comment tailnet/);
});

test("invalid input is refused with a clear message", async ({ page }) => {
  await page.getByLabel("Port or range").fill("70000");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText(/Enter a port from 1 to 65535/).first()).toBeVisible();
});

test("adding a rule runs it and lists it; deleting removes it", async ({ page }) => {
  await page.getByLabel("Port or range").fill("9443");
  await page.getByLabel("From").fill("10.20.30.0/24");
  await page.getByLabel("Comment").fill("e2e added rule");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText("Change queued")).toBeVisible();
  const rules = page.getByTestId("firewall-rules");
  const addedRow = rules.getByRole("row").filter({ hasText: "e2e added rule" });
  await expect(addedRow).toBeVisible({ timeout: 30_000 });
  await expect(addedRow).toContainText("9443/tcp");
  await expect(addedRow).toContainText("10.20.30.0/24");
  await expect(page.getByTestId("security-activity")).toContainText("Done");

  await addedRow.getByRole("button", { name: /Delete rule/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("command-label")).toHaveText(/sudo ufw --force delete \d+/);
  await dialog.getByRole("button", { name: "Delete rule" }).click();
  await expect(addedRow).toHaveCount(0, { timeout: 30_000 });
});

test("removing the last way in asks for confirmation first", async ({ page }) => {
  const rules = page.getByTestId("firewall-rules");
  const ipv4Row = (text: string) => rules.getByRole("row").filter({ hasText: text }).filter({ hasNotText: "(v6)" });
  const deleteRow = async (text: string) => {
    await ipv4Row(text).getByRole("button", { name: /Delete rule/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete rule" }).click();
  };
  await deleteRow("ssh, rate limited");
  await expect(ipv4Row("ssh, rate limited")).toHaveCount(0, { timeout: 30_000 });
  await deleteRow("Anywhere on tailscale0");
  const lockoutDialog = page.getByRole("dialog", { name: "This could lock you out" });
  /* Headless UI puts role=dialog on a zero-size wrapper, so check its content instead. */
  await expect(lockoutDialog.getByText(/last rule that lets you in/)).toBeVisible();
  const runAnyway = lockoutDialog.getByRole("button", { name: "Run it anyway" });
  await expect(runAnyway).toBeDisabled();
  await lockoutDialog.getByLabel(/I can reach this server another way/).check();
  await expect(runAnyway).toBeEnabled();
  await lockoutDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(lockoutDialog.getByText(/last rule that lets you in/)).toBeHidden();
  await expect(rules.getByRole("row").filter({ hasText: "Anywhere on tailscale0" }).filter({ hasNotText: "(v6)" })).toHaveCount(1);
});
