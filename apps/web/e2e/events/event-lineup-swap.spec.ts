import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { acceptAppDialog } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";

test.describe("event lineup swap", () => {
  test("staff swap two acts and each takes the other's position and set", async ({ page }) => {
    test.setTimeout(120_000);

    const band = runConvex("e2eHelpers:ensureBandPayeeUser", {
      email: e2eEnv.bandEmail,
      password: e2eEnv.bandPassword,
      name: e2eEnv.bandName,
      bandName: e2eEnv.bandOrgName,
    }) as { organizationId: string };
    const outsideAct = `E2E Outside Act ${Date.now()}`;
    const seeded = runConvex("e2eHelpers:seedLineupForSwap", {
      organizationId: band.organizationId,
      eventTitle: `E2E Lineup Swap ${Date.now()}`,
      externalArtistName: outsideAct,
    }) as { eventPath: string };

    await page.goto(`${seeded.eventPath}/artists`);
    await expect(page.getByTestId("event-workspace")).toBeVisible({ timeout: 30_000 });
    const cards = page.getByTestId("bill-card");
    await expect(cards).toHaveCount(2, { timeout: 20_000 });
    await expect(cards.nth(0)).toContainText("Opener");
    await expect(cards.nth(0)).toContainText(e2eEnv.bandOrgName);
    await expect(cards.nth(1)).toContainText("Headliner");
    await expect(cards.nth(1)).toContainText(outsideAct);
    const openerSet = await cards.nth(0).getByText(/ – /).textContent();

    await cards.nth(0).getByRole("button", { name: `More for ${e2eEnv.bandOrgName}` }).click();
    // Keyboard: a pointer cutting across the parent menu closes a Radix submenu.
    await page.getByRole("menuitem", { name: "Swap with…" }).press("ArrowRight");
    await page.getByRole("menuitem", { name: new RegExp(outsideAct) }).press("Enter");
    await acceptAppDialog(page, "Swap");

    // Positions keep their order and times; the acts trade places.
    await expect(cards.nth(0)).toContainText(outsideAct, { timeout: 20_000 });
    await expect(cards.nth(0)).toContainText("Opener");
    await expect(cards.nth(0)).toContainText(openerSet ?? "");
    await expect(cards.nth(1)).toContainText(e2eEnv.bandOrgName);
    await expect(cards.nth(1)).toContainText("Headliner");
  });
});
