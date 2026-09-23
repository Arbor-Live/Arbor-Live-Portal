import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

const directories = [
  { path: "/crew", heading: "The Team" },
  { path: "/artists", heading: "Artists" },
  { path: "/events", heading: "Upcoming events" },
] as const;

test.describe("public directories", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const { path, heading } of directories) {
    test(`${path} renders for signed-out visitors`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });
      // Client-side Convex queries should settle without an error boundary.
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    });
  }

  test("public event page includes newsletter and calendar section", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedPublicShowPage", {
      title: "E2E Public Show Calendar",
    }) as { eventId: string; title: string; path: string };

    const response = await page.goto(seeded.path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: seeded.title, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "Stay in the loop" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "This show" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Weekly email" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Calendar feed" })).toBeVisible();

    const ics = await page.request.get(`${seeded.path}/calendar.ics`);
    expect(ics.status()).toBe(200);
    const body = await ics.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:E2E Public Show Calendar");
    expect(body).toContain(`UID:arbor-event-${seeded.eventId}@arborlive.stanford.edu`);
  });
});
