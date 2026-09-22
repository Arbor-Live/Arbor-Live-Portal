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

    await page.goto(`${seeded.path}#feedback`);
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

    await page.goto(`${seeded.path}#feedback`);
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

  test("client can switch days and submit per-day feedback on the event quote portal", async ({
    page,
  }) => {
    const seeded = runConvex("e2eHelpers:seedPastMultiDayEventsForFeedback", {
      portal: "quote",
    }) as {
      path: string;
      days: Array<{ title: string; albumShareUrl: string }>;
    };
    const [day1, day2] = seeded.days;
    if (!day1 || !day2) throw new Error("Expected two seeded feedback days.");

    await page.goto(`${seeded.path}#feedback`);
    await expect(page.getByRole("tab", { name: "Day 1" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("tab", { name: "Day 2" })).toBeVisible();

    const albumLink = page.getByRole("link", { name: "View the album" });
    await expect(albumLink).toHaveAttribute("href", day1.albumShareUrl);
    await expect(page.getByText(`How was ${day1.title}?`).first()).toBeVisible();

    await page.getByRole("tab", { name: "Day 2" }).click();
    await expect(albumLink).toHaveAttribute("href", day2.albumShareUrl);
    await expect(page.getByText(`How was ${day2.title}?`).first()).toBeVisible();

    await page.getByRole("button", { name: "4 stars" }).click();
    await page
      .getByPlaceholder("What went well? What could we improve?")
      .fill("Day two sounded great.");
    await page.getByRole("button", { name: "Submit feedback" }).click();
    await expect(page.getByText(`Thanks for your feedback on ${day2.title}`).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("tab", { name: "Day 1" }).click();
    await expect(albumLink).toHaveAttribute("href", day1.albumShareUrl);
    await expect(page.getByText(`How was ${day1.title}?`).first()).toBeVisible();
    await page.getByRole("button", { name: "5 stars" }).click();
    await page
      .getByPlaceholder("What went well? What could we improve?")
      .fill("Day one crew was on it.");
    await page.getByRole("button", { name: "Submit feedback" }).click();
    await expect(page.getByText(`Thanks for your feedback on ${day1.title}`).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("tab", { name: "Day 2" }).click();
    await expect(page.getByText(`Thanks for your feedback on ${day2.title}`).first()).toBeVisible();
  });

  test("client can switch days and submit per-day feedback on the booking request track portal", async ({
    page,
  }) => {
    const seeded = runConvex("e2eHelpers:seedPastMultiDayEventsForFeedback", {
      portal: "request",
    }) as {
      path: string;
      days: Array<{ title: string; albumShareUrl: string }>;
    };
    const [day1, day2] = seeded.days;
    if (!day1 || !day2) throw new Error("Expected two seeded feedback days.");

    await page.goto(`${seeded.path}#feedback`);
    await expect(page.getByRole("tab", { name: "Day 1" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("tab", { name: "Day 2" })).toBeVisible();

    const albumLink = page.getByRole("link", { name: "View the album" });
    await expect(albumLink).toHaveAttribute("href", day1.albumShareUrl);

    await page.getByRole("tab", { name: "Day 2" }).click();
    await expect(albumLink).toHaveAttribute("href", day2.albumShareUrl);
    await expect(page.getByText(`How was ${day2.title}?`).first()).toBeVisible();
    await page.getByRole("button", { name: "5 stars" }).click();
    await page
      .getByPlaceholder("What went well? What could we improve?")
      .fill("Second night was even better.");
    await page.getByRole("button", { name: "Submit feedback" }).click();
    await expect(page.getByText(`Thanks for your feedback on ${day2.title}`).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
