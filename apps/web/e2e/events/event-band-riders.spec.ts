import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";

test.describe("event technical riders panel", () => {
  test("shows linked performers' default rider plot on overview", async ({ page }) => {
    const band = runConvex("e2eHelpers:ensureBandPayeeUser", {
      email: e2eEnv.bandEmail,
      password: e2eEnv.bandPassword,
      name: e2eEnv.bandName,
      bandName: e2eEnv.bandOrgName,
    }) as { organizationId: string; bandName: string };

    const seeded = runConvex("e2eHelpers:seedEventWithBandRider", {
      organizationId: band.organizationId,
      eventTitle: `E2E Rider Event ${Date.now()}`,
      riderName: `E2E Event Rider ${Date.now()}`,
    }) as {
      eventPath: string;
      eventTitle: string;
      riderName: string;
    };

    await page.goto(seeded.eventPath);
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 30_000 });

    const panel = page.getByTestId("event-band-riders");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText(band.bandName).first()).toBeVisible();
    await expect(panel.getByText(seeded.riderName).first()).toBeVisible();
    await expect(panel.getByRole("link", { name: "Open rider" })).toBeVisible();
    await expect(panel.locator("svg").first()).toBeVisible();
  });
});
