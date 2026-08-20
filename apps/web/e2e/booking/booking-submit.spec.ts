import { test, expect, type Page } from "@playwright/test";
import { adminAuthFile } from "../helpers/auth";
import { pollConvex } from "../helpers/convex";

async function clickNext(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

async function pickFutureCalendarDay(page: Page) {
  // Prefer mid-month in the next calendar month (always ≥7 days out from "today").
  const calendar = page.locator("[data-slot='calendar']").first();
  await expect(calendar).toBeVisible({ timeout: 20_000 });
  await calendar.getByRole("button", { name: "Go to the Next Month" }).click();
  await calendar.getByRole("button", { name: /\b15(st|nd|rd|th)?,/ }).click();
}

test.describe("public booking submit", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("applicant can submit a booking request via /request", async ({ browser }) => {
    const stamp = Date.now();
    const email = `e2e.booking.${stamp}@stanford.edu`;
    const eventName = `E2E Public Booking ${stamp}`;

    const publicContext = await browser.newContext();
    const page = await publicContext.newPage();
    await page.goto("/request");
    await expect(page.getByText("Welcome!").first()).toBeVisible({ timeout: 20_000 });

    await clickNext(page);
    await page.getByLabel("Stanford email").fill(email);
    await clickNext(page);

    await page.getByLabel("First Name").fill("E2E");
    await page.getByLabel("Last Name").fill("Booker");
    await page.getByLabel("Phone").fill("6505550188");
    await clickNext(page);

    await page.getByRole("radio", { name: "Individual Stanford Affiliate" }).click();
    await clickNext(page);

    // Venue is optional — skip by advancing with empty fields.
    await clickNext(page);

    await pickFutureCalendarDay(page);
    await page.getByText("Flexible setup time").click();
    await clickNext(page);

    await page.getByLabel("What is the name for your event?").fill(eventName);
    await clickNext(page);

    await page.getByRole("radio", { name: "Speaker Event" }).click();
    await clickNext(page);

    await page.getByRole("button", { name: "Crewed", exact: true }).click();
    await clickNext(page);

    // productionTier is skippable
    await page.getByRole("button", { name: "Skip", exact: true }).click();

    // eventDescription is skippable
    await page.getByRole("button", { name: "Skip", exact: true }).click();

    await page.getByLabel("Expected turnout").fill("75");
    await clickNext(page);

    // existingEquipment + additionalNotes skippable; last step submits
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText("Thank you!").first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Request ALREQ-/i).first()).toBeVisible({ timeout: 20_000 });
    await publicContext.close();

    const request = await pollConvex<{
      requestId: string;
      status: string;
      requestNumber: string | null;
      eventName: string | null;
      email: string;
      path: string;
    }>(
      "e2eHelpers:getLatestBookingRequestByEmail",
      { email },
      (row) => row?.status === "submitted" && row.eventName === eventName,
    );
    expect(request.requestNumber).toMatch(/^ALREQ-/);
    expect(request.email).toBe(email);

    const adminContext = await browser.newContext({ storageState: adminAuthFile });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(request.path);
    await expect(adminPage.getByText(request.requestNumber!).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(adminPage.getByText("submitted", { exact: true }).first()).toBeVisible();
    await adminContext.close();
  });
});
