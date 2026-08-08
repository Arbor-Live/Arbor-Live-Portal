import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

test.describe("public post-mortem form", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("day-of lead can submit the post-mortem form from the emailed link", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedPostMortemForm", {}) as {
      path: string;
      eventTitle: string;
    };

    await page.goto(seeded.path);
    await expect(page.getByText(/How did .*\?/).first()).toBeVisible({ timeout: 25_000 });

    await page.getByRole("button", { name: "4 stars" }).click();
    await page
      .getByPlaceholder("Crew, gear, communication, the show…")
      .fill("Clear call times and a sharp crew.");
    await page
      .getByPlaceholder("Anything we should do differently next time")
      .fill("Better patch panel labeling would speed up setup.");
    await page.getByRole("button", { name: "Submit post-mortem" }).click();

    await expect(page.getByText(/Post-mortem complete/).first()).toBeVisible({ timeout: 20_000 });
  });
});
