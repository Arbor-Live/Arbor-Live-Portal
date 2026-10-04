import { test, expect } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { runConvex } from "../helpers/convex";

test.describe("artist directory", () => {
  test.use({ storageState: crewAuthFile });

  test("crew find an act from a group-chat phone number and see who to reach", async ({ page }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const bandName = `E2E Directory Band ${stamp}`;
    const memberName = `E2E Directory Drummer ${stamp}`;
    const memberEmail = `e2e-directory-${stamp}@arborlive.test`;
    // Unique per run, so accumulated fixtures can't match the search.
    const memberPhone = `415${String(stamp).slice(-7)}`;
    const formattedPhone = `(${memberPhone.slice(0, 3)}) ${memberPhone.slice(3, 6)}-${memberPhone.slice(6)}`;

    const band = runConvex("e2eHelpers:ensureBandPayeeUser", {
      email: memberEmail,
      password: "E2eTestPassword1!",
      name: memberName,
      bandName,
      orgSlug: `e2e-directory-${stamp}`,
    }) as { organizationId: string };
    runConvex("e2eHelpers:setUserAdminProfileFields", { email: memberEmail, phone: memberPhone });
    runConvex("e2eHelpers:setArtistBookingContact", {
      organizationId: band.organizationId,
      mainContactName: `E2E Directory Manager ${stamp}`,
      mainContactEmail: `manager-${stamp}@arborlive.test`,
      mainContactPhone: "650-555-0100",
      bandMembers: [`E2E Directory Bassist ${stamp}`],
      publicListing: false,
    });
    const show = runConvex("e2eHelpers:seedUpcomingBandShow", {
      organizationId: band.organizationId,
      eventTitle: `E2E Directory Show ${stamp}`,
    }) as { eventTitle: string };

    await page.goto("/dashboard/artists/directory");
    await expect(page.getByTestId("artist-directory")).toBeVisible({ timeout: 30_000 });

    // Typed the way a phone shows it, stored as bare digits.
    await page.getByRole("textbox", { name: "Search artists" }).fill(formattedPhone);
    const row = page.getByTestId(`artist-directory-row-${band.organizationId}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(bandName);
    await expect(row).toContainText(`Matched ${memberName}`);
    await expect(page.getByTestId("artist-directory-summary")).toContainText("1 artist");

    await row.getByRole("button", { name: new RegExp(`^Band ${bandName}`) }).click();
    const sheet = page.getByTestId("artist-directory-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Internal only");
    await expect(sheet).toContainText(`E2E Directory Manager ${stamp}`);
    await expect(sheet.getByTestId("artist-directory-members")).toContainText(memberName);
    await expect(sheet.getByTestId("artist-directory-members")).toContainText(memberPhone);
    await expect(sheet).toContainText(`E2E Directory Bassist ${stamp}`);
    await expect(sheet.getByRole("link", { name: new RegExp(show.eventTitle) })).toBeVisible();
    // Crew aren't admins, so there's no organization management link.
    await expect(sheet.getByRole("link", { name: "Manage organization" })).toHaveCount(0);
  });
});
