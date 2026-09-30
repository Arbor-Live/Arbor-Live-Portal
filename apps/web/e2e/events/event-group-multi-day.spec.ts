import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

type SeededBooking = {
  invoiceId: string;
  groupId: string;
  eventIds: string[];
  groupPath: string;
};

type Position = { label: string; templateKey: string | null };

test.describe("event groups: multi-day booking", () => {
  test("a booking's days share a group, and a position template reaches every day once", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const title = `E2E Multi-day ${Date.now()}`;
    const seeded = runConvex("e2eHelpers:seedMultiDayBooking", { title }) as SeededBooking;

    // --- The event page shows the day's place in its booking ---
    await page.goto(`/dashboard/events/${seeded.eventIds[1]}`);
    await expect(page.getByTestId("event-workspace")).toBeVisible({ timeout: 25_000 });
    const groupLink = page.getByRole("link", { name: /View booking/ });
    await expect(groupLink).toContainText(`Part of ${title} · Day 2 of 2`, { timeout: 25_000 });

    // --- The group page lists both days ---
    await groupLink.click();
    await page.waitForURL(new RegExp(seeded.groupPath), { timeout: 30_000 });
    await expect(page.getByTestId("event-group-workspace")).toContainText("Multi-day booking", {
      timeout: 25_000,
    });
    await expect(page.getByTestId("event-group-days-summary")).toContainText("2 days");
    await expect(page.getByTestId("event-group-day-row")).toHaveCount(2);

    // --- A template position applies to all days ---
    await page.getByRole("link", { name: /Positions template/ }).click();
    await page.waitForURL(new RegExp(`${seeded.groupPath}/positions`), { timeout: 30_000 });
    const editor = page.getByTestId("series-position-editor");
    await editor.getByRole("button", { name: "Add position" }).click();
    const sheet = page.getByTestId("position-template-sheet");
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await sheet.getByLabel("Name").fill("Headliner");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 15_000 });
    await expect(editor.getByTestId("series-position-list")).toContainText("Headliner");

    const apply = page.getByRole("button", { name: /Save template.*apply positions/ }).first();
    await apply.click();
    for (const eventId of seeded.eventIds) {
      await pollConvex<Position[]>(
        "e2eHelpers:getEventPositions",
        { eventId },
        (rows) => rows?.length === 1 && rows[0]?.label === "Headliner" && rows[0]?.templateKey !== null,
      );
    }

    // --- Re-applying is idempotent: still one position per day ---
    await apply.click();
    await expect(page.getByText(/applied it to 2 days/).first()).toBeVisible({ timeout: 25_000 });
    for (const eventId of seeded.eventIds) {
      const rows = runConvex("e2eHelpers:getEventPositions", { eventId }) as Position[];
      expect(rows).toHaveLength(1);
    }

    // --- "Apply this day's setup" from Day 1 reaches Day 2 through the template ---
    await page.goto(`/dashboard/events/${seeded.eventIds[0]}`);
    await expect(page.getByTestId("event-workspace")).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: "More event actions" }).click();
    await page.getByRole("menuitem", { name: /Apply this day.s setup to other days/ }).click();
    const dialog = page.getByTestId("apply-day-setup-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Apply setup" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 25_000 });
    await expect(page.getByText(/Applied this day's setup to 1 other day/).first()).toBeVisible({
      timeout: 25_000,
    });
    for (const eventId of seeded.eventIds) {
      const rows = runConvex("e2eHelpers:getEventPositions", { eventId }) as Position[];
      expect(rows.map((row) => row.label)).toEqual(["Headliner"]);
    }
  });
});
