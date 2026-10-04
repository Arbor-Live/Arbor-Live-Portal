import { expect, test, type Browser, type Page } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const NUDGE = "Add Arbor Live to your Home Screen";

async function openIphone(browser: Browser, options: { standalone: boolean }) {
  const context = await browser.newContext({
    storageState: "e2e/.auth/admin.json",
    userAgent: IPHONE_UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  if (options.standalone) {
    // iOS reports a Home Screen launch through `navigator.standalone`.
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "standalone", { get: () => true });
    });
  }
  return context;
}

async function nudgeItem(page: Page) {
  await page.getByRole("button", { name: /^Notifications/ }).click();
  return page.getByRole("dialog").getByRole("button", { name: new RegExp(NUDGE) });
}

test.describe("Home Screen install nudge", () => {
  test.beforeEach(() => {
    runConvex("e2eHelpers:resetAppInstall", { email: e2eEnv.adminEmail });
  });

  test("phone browser gets a nudge until the app is opened from the Home Screen", async ({
    browser,
  }) => {
    const browserContext = await openIphone(browser, { standalone: false });
    const page = await browserContext.newPage();
    await page.goto("/dashboard");

    const item = await nudgeItem(page);
    await expect(item).toContainText("unread");
    await item.click();
    const dialog = page.getByRole("dialog", { name: NUDGE });
    await expect(dialog).toContainText("Add to Home Screen");
    await expect(dialog).toContainText("Share");
    await dialog.getByRole("button", { name: "Done" }).click();

    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect(page.getByRole("button", { name: "Add to Home Screen" })).toBeVisible();
    await browserContext.close();

    const appContext = await openIphone(browser, { standalone: true });
    const app = await appContext.newPage();
    await app.goto("/dashboard");
    await expect(await nudgeItem(app)).not.toContainText("unread");
    await app.keyboard.press("Escape");
    await app.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect(app.getByRole("link", { name: "Support" })).toBeVisible();
    await expect(app.getByRole("button", { name: "Add to Home Screen" })).toHaveCount(0);
    await appContext.close();
  });

  test("desktop browsers never get the nudge", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await expect(page.getByRole("dialog").getByText("Notifications", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: new RegExp(NUDGE) })).toHaveCount(0);
  });
});
