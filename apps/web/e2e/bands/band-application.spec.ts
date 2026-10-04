import { test, expect } from "@playwright/test";
import { adminAuthFile } from "../helpers/auth";
import { pollConvex } from "../helpers/convex";

test.describe("public band application", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("applicant can submit and admin can approve", async ({ browser }) => {
    const stamp = Date.now();
    const contactName = `E2E Band Contact ${stamp}`;
    const email = `e2e.band.apply.${stamp}@stanford.edu`;
    const bandName = `E2E Band ${stamp}`;

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto("/artists/apply");
    await expect(publicPage.getByLabel("Full name")).toBeVisible({ timeout: 20_000 });

    await publicPage.getByLabel("Full name").fill(contactName);
    await publicPage.getByLabel("Stanford email").fill(email);
    await publicPage.getByLabel("Artist name").fill(bandName);
    await publicPage
      .getByRole("button", {
        name: /I'm performing solo — no other members to list/i,
      })
      .click();
    await publicPage.getByRole("button", { name: "Join the community" }).click();
    await expect(publicPage.getByText("You're in the mix").first()).toBeVisible({
      timeout: 25_000,
    });
    await publicContext.close();

    const app = await pollConvex<{
      applicationId: string;
      status: string;
      bandDisplayName: string;
      contactEmail: string;
      organizationId: string | null;
    }>(
      "e2eHelpers:getLatestBandApplicationByEmail",
      { email },
      (row) => row?.status === "submitted" && row.bandDisplayName === bandName,
    );
    expect(app.contactEmail).toBe(email);

    const adminContext = await browser.newContext({ storageState: adminAuthFile });
    const adminPage = await adminContext.newPage();
    // The page starts on pending applications.
    await adminPage.goto("/dashboard/users/artist-applications");
    await expect(adminPage.getByTestId("artist-applications-page")).toBeVisible({ timeout: 25_000 });
    await expect(adminPage.getByTestId("filter-chip-status")).toContainText("Pending");
    await adminPage.getByRole("textbox", { name: "Search applications" }).fill(bandName);
    const row = adminPage.getByTestId("artist-application-row").filter({ hasText: bandName });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(adminPage.getByTestId("artist-applications-group-submitted")).toContainText(bandName);

    await row.getByRole("button", { name: new RegExp(`^.*${bandName}`) }).first().click();
    const sheet = adminPage.getByTestId("artist-application-sheet");
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await expect(sheet).toContainText(contactName);
    await expect(sheet).toContainText("Solo performer");
    await expect(adminPage).toHaveURL(new RegExp(`application=${app.applicationId}`));
    await sheet.getByRole("button", { name: "Approve", exact: true }).click();

    const approved = await pollConvex<{
      status: string;
      organizationId: string | null;
      bandDisplayName: string;
    }>(
      "e2eHelpers:getLatestBandApplicationByEmail",
      { email },
      (row) => row?.status === "approved" && Boolean(row.organizationId),
    );
    expect(approved.bandDisplayName).toBe(bandName);
    expect(approved.organizationId).toBeTruthy();

    // The panel closes on success, and the row leaves the pending view.
    await expect(sheet).toHaveCount(0, { timeout: 20_000 });
    await expect(row).toHaveCount(0, { timeout: 20_000 });

    // A deep link opens it again, across every status.
    await adminPage.goto(`/dashboard/users/artist-applications?application=${app.applicationId}`);
    await expect(sheet).toBeVisible({ timeout: 25_000 });
    await expect(sheet).toContainText("Approved");
    await expect(sheet.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await adminContext.close();
  });
});
