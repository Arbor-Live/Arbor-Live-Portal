import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

const shotDir = process.env.E2E_SHOT_DIR;

async function openPoster(
  page: import("@playwright/test").Page,
  status: "tentative" | "ready",
) {
  const stamp = Date.now();
  const title = `E2E Publish ${status} ${stamp}`;
  const { eventId } = runConvex("e2eHelpers:seedPosterWork", {
    eventTitle: title,
    externalArtistName: `E2E Publish Act ${stamp}`,
    visibility: "public",
    status,
    design: { status: "draft", imageUrl: "https://placehold.co/800x1000/png" },
  }) as { eventId: string };

  await page.goto(`/dashboard/marketing/designs?event=${eventId}`);
  const sheet = page.getByTestId("design-board-sheet");
  await expect(sheet).toContainText(title, { timeout: 30_000 });
  return sheet;
}

test.describe("poster publish", () => {
  test("a tentative public event says why its poster can't be published", async ({ page }) => {
    test.setTimeout(120_000);
    const sheet = await openPoster(page, "tentative");

    await expect(sheet.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
    await expect(sheet).toContainText(
      "The event is still tentative. Its poster can be published once the event is confirmed.",
    );
    if (shotDir) {
      await page.screenshot({ path: `${shotDir}/tentative.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(sheet.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
      await page.screenshot({ path: `${shotDir}/tentative-phone.png` });
    }
  });

  test("a confirmed public event can publish its poster", async ({ page }) => {
    test.setTimeout(120_000);
    const sheet = await openPoster(page, "ready");

    await expect(sheet.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await expect(sheet).not.toContainText("still tentative");
    if (shotDir) await page.screenshot({ path: `${shotDir}/confirmed.png` });
  });
});
