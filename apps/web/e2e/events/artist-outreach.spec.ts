import { test, expect } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { runConvex } from "../helpers/convex";
import { fillSearchableSelectQuery } from "../helpers/select";

test.describe("artist outreach on open positions", () => {
  test("ops track who they asked to play a date and book an available act into a slot", async ({ page }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const bandName = `E2E Outreach Band ${stamp}`;
    const outsideAct = `E2E Outside Act ${stamp}`;
    runConvex("e2eHelpers:ensureBandPayeeUser", {
      email: `e2e-outreach-${stamp}@arborlive.test`,
      password: "E2eTestPassword1!",
      name: `E2E Outreach Member ${stamp}`,
      bandName,
      orgSlug: `e2e-outreach-${stamp}`,
    });
    // Two open slots: a no-preference Headliner and a live-band Opener.
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Outreach Show ${stamp}`,
      status: "ready",
      openPosition: true,
      openerPosition: true,
    }) as { title: string; eventId: string };

    await page.goto("/dashboard/artists/positions");
    await page.getByRole("textbox", { name: "Search open positions" }).fill(seeded.title);
    const event = page.getByTestId("open-positions-event").filter({ hasText: seeded.title });
    await expect(event).toBeVisible({ timeout: 30_000 });
    await expect(event.getByTestId("open-positions-outreach")).toHaveText("Nobody asked yet");

    await event.getByRole("button", { name: "Outreach" }).click();
    const sheet = page.getByTestId("outreach-sheet");
    const summary = sheet.getByTestId("outreach-summary");
    await expect(summary).toContainText("Nobody asked yet · 2 open slots", { timeout: 20_000 });

    // One list for the date: a portal artist from the directory, then an act that isn't on the portal.
    await sheet.getByTestId("outreach-checklist").getByTestId("searchable-select-trigger").last().click();
    const menu = page.getByTestId("searchable-select-menu");
    await fillSearchableSelectQuery(menu, bandName);
    await menu.getByRole("option", { name: new RegExp(bandName) }).first().click({ force: true });
    await expect(summary).toContainText("Asked 1 · 1 waiting");
    await sheet.getByRole("textbox", { name: "Outside act name" }).fill(outsideAct);
    await sheet.getByRole("button", { name: "Add" }).click();
    await expect(summary).toContainText("Asked 2 · 2 waiting");

    // Tag the band for the Opener slot, then record the replies; the board follows.
    const bandRow = sheet.locator("li").filter({ hasText: bandName });
    await bandRow.getByTestId("outreach-slot").getByTestId("searchable-select-trigger").click();
    await page.getByTestId("searchable-select-menu").getByRole("option", { name: "Opener" }).click({ force: true });
    await expect(bandRow.getByTestId("outreach-slot")).toContainText("Opener");
    await sheet.getByRole("radiogroup", { name: `Reply from ${outsideAct}` }).getByRole("radio", { name: "Can't" }).click();
    await sheet.getByRole("radiogroup", { name: `Reply from ${bandName}` }).getByRole("radio", { name: "Available" }).click();
    await expect(summary).toContainText("Asked 2 · 1 available · 1 can't");
    await expect(event.getByTestId("open-positions-outreach")).toHaveText("Asked 2 · 1 available · 1 can't");

    // A band fits both slots, so Book asks which; the tagged slot is offered first.
    await bandRow.getByRole("button", { name: "Book" }).click();
    const slots = page.getByRole("menuitem");
    await expect(slots.first()).toContainText("Opener");
    await slots.first().click();
    await expect(bandRow.getByTestId("outreach-booked")).toHaveText("Booked · Opener");
    await expect(summary).toContainText("Asked 1 · 1 can't · 1 booked · 1 open slot");

    // The Headliner is still open, so the show stays on the board without the booked act.
    await expect(event.getByTestId("open-positions-outreach")).toHaveText("Asked 1 · 1 can't");
    await expect(event.getByText("Opener")).toHaveCount(0);

    // Acts that can't make it fold away behind a toggle.
    const outsideRow = sheet.locator("li").filter({ hasText: outsideAct });
    await expect(outsideRow).toHaveCount(0);
    await sheet.getByTestId("outreach-declined-toggle").click();
    await expect(outsideRow).toBeVisible();

    // They change their mind: book them into the last open slot, which fills the bill.
    await sheet.getByRole("radiogroup", { name: `Reply from ${outsideAct}` }).getByRole("radio", { name: "Available" }).click();
    await outsideRow.getByRole("button", { name: "Book" }).click();
    await expect(event).toHaveCount(0, { timeout: 20_000 });

    // With every slot filled, the Lineup's Outreach card collapses to its summary.
    await page.goto(`/dashboard/events/${seeded.eventId}/artists`);
    const card = page.getByTestId("outreach-card");
    await expect(card.getByTestId("outreach-card-summary")).toHaveText("Every slot is filled · 2 booked", {
      timeout: 30_000,
    });
    await expect(card.getByTestId("outreach-checklist")).toHaveCount(0);
    await card.getByRole("button", { name: "Show" }).click();
    await expect(card.getByTestId("outreach-booked")).toHaveCount(2);
  });

  test.describe("crew", () => {
    test.use({ storageState: crewAuthFile });

    test("are refused on Open positions and don't see it in the sidebar", async ({ page }) => {
      await page.goto("/dashboard/artists/positions");
      await expect(page.getByText("Operations access required").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
      const sidebar = page.locator('[data-slot="sidebar"]').first();
      await expect(sidebar.locator('a[href="/dashboard/artists/positions"]')).toHaveCount(0);
    });
  });
});
