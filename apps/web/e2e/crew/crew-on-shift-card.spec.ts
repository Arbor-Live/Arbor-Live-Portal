import { expect, test } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";

test.use({ storageState: crewAuthFile });

test("crew on a shift get the event first on home and can open it", async ({ page }) => {
  const { userId } = runConvex("e2eHelpers:ensureCrewUser", {
    email: e2eEnv.crewEmail,
    password: e2eEnv.crewPassword,
    name: e2eEnv.crewName,
  }) as { userId: string };
  const title = `E2E On Shift ${Date.now()}`;
  const { eventId } = runConvex("e2eHelpers:seedOnShiftEvent", {
    userId,
    title,
    venueName: "Bing Concert Hall",
    startOffsetMinutes: -60,
    endOffsetMinutes: 120,
  }) as { eventId: string };

  try {
    await page.goto("/dashboard");
    const card = page.getByRole("main").getByTestId("home-on-shift-card");
    await expect(card).toContainText("On shift now");
    await expect(card).toContainText(title);
    await expect(card).toContainText("Bing Concert Hall");

    await card.getByRole("link", { name: "Open event" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/events/${eventId}`));
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  } finally {
    runConvex("e2eHelpers:clearOnShiftEvent", { eventId });
  }
});
