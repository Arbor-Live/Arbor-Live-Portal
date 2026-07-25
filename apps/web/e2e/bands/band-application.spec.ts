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
    await publicPage.getByLabel("Band / artist name").fill(bandName);
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
    await adminPage.goto("/dashboard/users/band-applications");
    await expect(adminPage.getByRole("button", { name: "Pending" }).first()).toBeVisible({
      timeout: 25_000,
    });
    await adminPage.getByRole("button", { name: "Pending" }).click();
    await expect(adminPage.getByText(bandName).first()).toBeVisible({ timeout: 20_000 });

    const row = adminPage.locator("article").filter({ hasText: bandName });
    await row.getByRole("button", { name: "Approve", exact: true }).click();

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

    await adminPage.getByRole("button", { name: "Approved" }).click();
    await expect(adminPage.getByText(bandName).first()).toBeVisible({ timeout: 20_000 });
    await adminContext.close();
  });
});
