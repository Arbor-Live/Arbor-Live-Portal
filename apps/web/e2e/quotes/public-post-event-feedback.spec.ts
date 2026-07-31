import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

test.describe("post-event portal section", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("client sees the photo album and can submit feedback on the event quote portal", async ({
    page,
  }) => {
    const seeded = runConvex("e2eHelpers:seedPastLinkedEventForFeedback", {
      portal: "quote",
    }) as {
      path: string;
      albumShareUrl: string;
    };

    await page.goto(seeded.path);
    await expect(page.getByText("Photo album").first()).toBeVisible({ timeout: 25_000 });
    const albumLink = page.getByRole("link", { name: "View the album" });
    await expect(albumLink).toHaveAttribute("href", seeded.albumShareUrl);

    await expect(page.getByText(/How was .*\?/).first()).toBeVisible();
    await page.getByRole("button", { name: "4 stars" }).click();
    await page
      .getByPlaceholder("What went well? What could we improve?")
      .fill("Great sound and a friendly crew!");
    await page.getByRole("button", { name: "Submit feedback" }).click();

    await expect(page.getByText(/Thanks for your feedback/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("client sees the photo album and can submit feedback on the booking request track portal", async ({
    page,
  }) => {
    const seeded = runConvex("e2eHelpers:seedPastLinkedEventForFeedback", {
      portal: "request",
    }) as {
      path: string;
      albumShareUrl: string;
    };

    await page.goto(seeded.path);
    await expect(page.getByText("Photo album").first()).toBeVisible({ timeout: 25_000 });
    const albumLink = page.getByRole("link", { name: "View the album" });
    await expect(albumLink).toHaveAttribute("href", seeded.albumShareUrl);

    await expect(page.getByText(/How was .*\?/).first()).toBeVisible();
    await page.getByRole("button", { name: "5 stars" }).click();
    await page
      .getByPlaceholder("What went well? What could we improve?")
      .fill("Seamless coordination from start to finish.");
    await page.getByRole("button", { name: "Submit feedback" }).click();

    await expect(page.getByText(/Thanks for your feedback/).first()).toBeVisible({ timeout: 20_000 });
  });
});
