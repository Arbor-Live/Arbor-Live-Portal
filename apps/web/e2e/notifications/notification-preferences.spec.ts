import { expect, test, type Page } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";

const IN_APP_SWITCH = "Comment mentions: In-app";
const PUSH_SWITCH = "Comment mentions: Push";

async function setSwitch(page: Page, name: string, on: boolean) {
  const control = page.getByRole("switch", { name, exact: true });
  if ((await control.getAttribute("aria-checked")) !== String(on)) await control.click();
  await expect(control).toHaveAttribute("aria-checked", String(on));
}

test.describe("notification preferences", () => {
  test.afterEach(async ({ page }) => {
    // The admin account is shared across specs; leave mentions on.
    await page.goto("/dashboard/account");
    await setSwitch(page, IN_APP_SWITCH, true);
  });

  test("muting a type in the bell stops new ones from appearing there", async ({ page }) => {
    await page.goto("/dashboard/account");
    await setSwitch(page, IN_APP_SWITCH, false);
    // Push rides on the in-app row, so it locks off with it.
    await expect(page.getByRole("switch", { name: PUSH_SWITCH, exact: true })).toBeDisabled();

    const title = `E2E muted mention ${Date.now()}`;
    runConvex("e2eHelpers:enqueueInAppNotificationEmail", {
      to: e2eEnv.adminEmail,
      path: "/dashboard/account",
      title,
    });

    await page.getByRole("button", { name: /^Notifications/ }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Notifications", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
  });
});
