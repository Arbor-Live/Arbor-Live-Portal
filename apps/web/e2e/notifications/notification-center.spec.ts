import { expect, test, type Page } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";

/** Seed a mention email to the admin; their account mirrors it into the bell. */
function seedNotification(args: { title: string; path: string; debounceMs?: number }) {
  runConvex("e2eHelpers:enqueueInAppNotificationEmail", { to: e2eEnv.adminEmail, ...args });
}

async function openBell(page: Page) {
  await page.getByRole("button", { name: /^Notifications/ }).click();
  return page.getByRole("dialog");
}

test.describe("notification center", () => {
  test("visiting the linked page marks the notification read", async ({ page }) => {
    const nonce = Date.now();
    const title = `E2E auto-read ${nonce}`;
    const path = `/dashboard/account?e2eNotification=${nonce}`;
    seedNotification({ title, path });

    await page.goto("/dashboard");
    const panel = await openBell(page);
    const item = panel.getByRole("button", { name: new RegExp(title) });
    await expect(item).toContainText("unread");
    await page.keyboard.press("Escape");

    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
    const reopened = await openBell(page);
    await expect(reopened.getByRole("button", { name: new RegExp(title) })).not.toContainText(
      "unread",
    );
  });

  test("clicking a notification opens its page", async ({ page }) => {
    const nonce = Date.now();
    const title = `E2E click-through ${nonce}`;
    seedNotification({ title, path: `/dashboard/account?e2eNotification=${nonce}` });

    await page.goto("/dashboard");
    const panel = await openBell(page);
    await panel.getByRole("button", { name: new RegExp(title) }).click();
    await expect(page).toHaveURL(new RegExp(`e2eNotification=${nonce}`));
  });

  test("debounced updates stay hidden until the window closes", async ({ page }) => {
    const title = `E2E pending ${Date.now()}`;
    seedNotification({ title, path: "/dashboard/account", debounceMs: 10 * 60_000 });

    await page.goto("/dashboard");
    const panel = await openBell(page);
    await expect(panel.getByText("Notifications", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
  });
});
