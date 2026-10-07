import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { runConvex } from "../helpers/convex";

/** Ring's thumbnails are one H.264 keyframe, not an image; this one is a generated test pattern. */
async function uploadKeyframeThumbnail() {
  const { uploadUrl } = runConvex("e2eHelpers:generateRingThumbnailUploadUrl") as { uploadUrl: string };
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/h264" },
    body: readFileSync(path.join(__dirname, "ring-thumbnail.h264")),
  });
  const { storageId } = (await response.json()) as { storageId: string };
  return storageId;
}

test.describe("ring camera page", () => {
  test("lists clips by day, filters by type, and steps through them in the player", async ({ page }) => {
    test.setTimeout(120_000);

    const { clipIds } = runConvex("e2eHelpers:seedRingCamera", { clipCount: 14 }) as { clipIds: string[] };

    await page.goto("/dashboard/camera");
    await expect(page.getByRole("heading", { name: "Loading dock" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("ring-clip-summary")).toContainText("14 clips");
    await expect(page.getByTestId("ring-clip-row")).toHaveCount(14);

    // The seed makes every seventh clip a doorbell press: 2 of 14.
    await page.getByRole("radio", { name: "Doorbell" }).click();
    await expect(page.getByTestId("ring-clip-summary")).toContainText("2 clips");
    await expect(page.getByTestId("ring-clip-row").first()).toContainText("Doorbell");
    await page.getByRole("radio", { name: "All" }).click();
    await expect(page.getByTestId("ring-clip-row")).toHaveCount(14);

    // Newest clip first; "Older" moves down the list and updates the deep link.
    await page.getByTestId("ring-clip-row").first().getByRole("button").first().click();
    const sheet = page.getByTestId("ring-clip-sheet");
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`clip=${clipIds[0]}`));
    await expect(sheet.getByRole("button", { name: "Newer" })).toBeDisabled();
    await sheet.getByRole("button", { name: "Older" }).click();
    await expect(page).toHaveURL(new RegExp(`clip=${clipIds[1]}`));
    await expect(sheet).toContainText("Motion");

    // A deep link reopens the same clip.
    await page.reload();
    await expect(page.getByTestId("ring-clip-sheet")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`clip=${clipIds[1]}`));
  });

  test("decodes Ring's video-frame thumbnails into images", async ({ page }) => {
    test.setTimeout(120_000);
    const storageId = await uploadKeyframeThumbnail();
    runConvex("e2eHelpers:seedRingCamera", { clipCount: 3, thumbnailStorageIds: [storageId] });

    await page.goto("/dashboard/camera");
    const thumbnail = page.getByTestId("ring-clip-row").first().getByTestId("ring-clip-thumbnail");
    await expect(thumbnail).toHaveAttribute("src", /^blob:/, { timeout: 30_000 });
    await expect.poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320);
  });

  test.describe("as crew", () => {
    test.use({ storageState: crewAuthFile });

    test("crew can't see the camera", async ({ page }) => {
      runConvex("e2eHelpers:seedRingCamera", { clipCount: 2 });
      await page.goto("/dashboard/camera");
      await expect(page.getByText("The camera is only available to Arbor Live admins.")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("ring-clip-row")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Camera" })).toHaveCount(0);
    });
  });
});
