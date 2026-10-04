import { test, expect, type Page } from "@playwright/test";
import { acceptAppDialog, dismissAppDialog } from "../helpers/auth";
import { pollConvex, runConvex } from "../helpers/convex";
import { bulkLabel, bulkStamp, purgeBulk, seedBulk } from "../helpers/bulk-seed";
import { addFilter } from "../helpers/filter-bar";

type ApplicationState = {
  applicationId: string;
  status: string;
  declineReason: string | null;
};

/** Seed one submitted application; its name and email come from the bulk seeder. */
function seedApplication(stamp: string) {
  seedBulk("seedBandApplications", stamp, 1);
  return { name: bulkLabel(stamp, 0), email: `e2e.bulk.band.${stamp}.0@example.com` };
}

async function openApplication(page: Page, name: string) {
  await page.goto("/dashboard/users/artist-applications");
  await expect(page.getByTestId("artist-applications-page")).toBeVisible({ timeout: 25_000 });
  await page.getByRole("textbox", { name: "Search applications" }).fill(name);
  const row = page.getByTestId("artist-application-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 25_000 });
  return row;
}

/**
 * Declining an artist application on `/dashboard/users/artist-applications`.
 * Decline emails the contact, so it confirms first; a cancelled confirm must
 * leave the application pending and the panel open.
 */
test.describe("artist application decline", () => {
  const stamps: string[] = [];

  test.afterAll(() => {
    for (const stamp of stamps) purgeBulk(stamp, ["bandApplications"]);
  });

  test("declining from the panel confirms first and sends the reason", async ({ page }) => {
    const stamp = bulkStamp();
    stamps.push(stamp);
    const seeded = seedApplication(stamp);

    const row = await openApplication(page, seeded.name);
    await row.getByRole("button", { name: new RegExp(seeded.name) }).first().click();
    const sheet = page.getByTestId("artist-application-sheet");
    await expect(sheet).toBeVisible({ timeout: 20_000 });

    await sheet.getByLabel("Decline reason (optional)").fill("We're booked through the quarter.");
    await sheet.getByRole("button", { name: "Decline", exact: true }).click();
    // Cancelling keeps everything as it was.
    await dismissAppDialog(page);
    await expect(sheet).toBeVisible();
    const untouched = runConvex("e2eHelpers:getLatestBandApplicationByEmail", {
      email: seeded.email,
    }) as ApplicationState;
    expect(untouched.status).toBe("submitted");

    await sheet.getByRole("button", { name: "Decline", exact: true }).click();
    await acceptAppDialog(page, "Decline application");

    const declined = await pollConvex<ApplicationState>(
      "e2eHelpers:getLatestBandApplicationByEmail",
      { email: seeded.email },
      (state) => state?.status === "declined",
    );
    expect(declined.declineReason).toBe("We're booked through the quarter.");
    await expect(sheet).toHaveCount(0, { timeout: 20_000 });
    // It leaves the default (pending) view…
    await expect(row).toHaveCount(0, { timeout: 20_000 });

    // …and shows under Declined.
    await page.getByTestId("filter-chips").getByRole("button", { name: "Clear all" }).click();
    await addFilter(page, "Status", ["Declined"]);
    await expect(page.getByTestId("artist-applications-group-declined")).toContainText(seeded.name, {
      timeout: 20_000,
    });
  });

  test("declining from the row menu confirms first", async ({ page }) => {
    const stamp = bulkStamp();
    stamps.push(stamp);
    const seeded = seedApplication(stamp);

    const row = await openApplication(page, seeded.name);
    await row.getByRole("button", { name: `More for ${seeded.name}` }).click();
    await page.getByRole("menuitem", { name: "Decline" }).click();
    await acceptAppDialog(page, "Decline application");

    const declined = await pollConvex<ApplicationState>(
      "e2eHelpers:getLatestBandApplicationByEmail",
      { email: seeded.email },
      (state) => state?.status === "declined",
    );
    expect(declined.declineReason).toBeNull();
    await expect(row).toHaveCount(0, { timeout: 20_000 });
  });
});
