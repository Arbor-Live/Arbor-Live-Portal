import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";
import { acceptAppDialog } from "../helpers/auth";
import { pickSearchableOption } from "../helpers/select";

type SeededBooking = {
  invoiceId: string;
  groupId: string;
  eventIds: string[];
  startAts: number[];
  groupPath: string;
};
type EventFields = { title: string; status: string; notes: string | null; teamsInterested: string[] };

type Position = { label: string; templateKey: string | null };
type GroupState = { kind: string; occurrenceCount: number; updatedAt: number };

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
    const before = runConvex("e2eHelpers:getEventSeriesStateByEventId", {
      eventId: seeded.eventIds[0],
    }) as GroupState;
    await apply.click();
    // Wait for the second save itself to land, not the first save's toast.
    await pollConvex<GroupState>(
      "e2eHelpers:getEventSeriesStateByEventId",
      { eventId: seeded.eventIds[0] },
      (state) => (state?.updatedAt ?? 0) > before.updatedAt,
    );
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

    // --- Cancelling Day 2 keeps it in the booking, marked cancelled ---
    await page.goto(seeded.groupPath);
    await expect(page.getByTestId("event-group-days-summary")).toContainText("2 days", {
      timeout: 25_000,
    });
    await pickSearchableOption(
      page,
      page.getByTestId("event-group-days").getByTestId("searchable-select-trigger"),
      "Day 2",
      /^Day 2 · /,
    );
    await page.getByRole("button", { name: "Cancel days" }).click();
    await acceptAppDialog(page, "Cancel days");
    await expect(page.getByTestId("event-group-days-summary")).toContainText("1 cancelled", {
      timeout: 25_000,
    });
    const afterCancel = await pollConvex<GroupState>(
      "e2eHelpers:getEventSeriesStateByEventId",
      { eventId: seeded.eventIds[1] },
      (state) => state?.occurrenceCount === 2,
    );
    expect(afterCancel.kind).toBe("multi_day");
  });

  test("an 'All days' edit spreads only what was edited and leaves each day's own fields", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const title = `E2E Multi-day Edit ${Date.now()}`;
    const seeded = runConvex("e2eHelpers:seedMultiDayBooking", { title }) as SeededBooking;
    const [day1, day2] = seeded.eventIds as [string, string];

    await page.goto(`/dashboard/events/${day1}`);
    await expect(page.getByTestId("event-workspace")).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: "Lighting", exact: true }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "All days" }).click();
    await expect(page.getByText("Event saved.").first()).toBeVisible({ timeout: 30_000 });

    // Day 2 picked up the shared field...
    const spread = await pollConvex<EventFields>(
      "e2eHelpers:getEventFields",
      { eventId: day2 },
      (fields) => fields?.teamsInterested.includes("Lighting") === true,
    );
    // ...and nothing else: its own title, status and notes stay.
    expect(spread.title).toBe(`${title} — Day 2`);
    expect(spread.status).toBe("ready");
    expect(spread.notes).toBe("Day 2 notes");
  });

  test("adding a day puts it on the booking's invoice and in its group", async ({ page }) => {
    test.setTimeout(180_000);
    const title = `E2E Multi-day Add ${Date.now()}`;
    const seeded = runConvex("e2eHelpers:seedMultiDayBooking", { title }) as SeededBooking;
    // A day of this month that the booking doesn't already use.
    const taken = new Set(
      seeded.startAts.map((ms) =>
        new Date(ms).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", day: "numeric" }),
      ),
    );
    const dayLabel = ["28", "27", "26"].find((candidate) => !taken.has(candidate))!;

    await page.goto(seeded.groupPath);
    await expect(page.getByTestId("event-group-days-summary")).toContainText("2 days", {
      timeout: 25_000,
    });
    await page.getByRole("button", { name: /Pick a date/ }).click();
    await page
      .locator("[data-slot='popover-content']")
      .last()
      .locator("[data-slot='calendar']")
      .locator("button:not([data-outside])")
      .filter({ hasText: new RegExp(`^${dayLabel}$`) })
      .click();
    await page.getByRole("button", { name: "Add day" }).click();
    await expect(page.getByTestId("event-group-days-summary")).toContainText("3 days", {
      timeout: 30_000,
    });

    const state = await pollConvex<GroupState & { occurrenceTitles: string[] }>(
      "e2eHelpers:getEventSeriesStateByEventId",
      { eventId: seeded.eventIds[0] },
      (group) => group?.occurrenceCount === 3,
    );
    expect(state.kind).toBe("multi_day");
    // The new day is titled from the booking, not left as "Day N".
    expect(state.occurrenceTitles.filter((name) => name.startsWith(`${title} — `))).toHaveLength(3);
  });
});
