import { test, expect } from "@playwright/test";
import { adminAuthFile } from "../helpers/auth";
import { pollConvex } from "../helpers/convex";

test.describe("public crew application", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("applicant can submit and admin sees submitted application", async ({ browser }) => {
    const stamp = Date.now();
    const name = `E2E Applicant ${stamp}`;
    const email = `e2e.crew.apply.${stamp}@stanford.edu`;

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto("/crew/apply");
    await expect(publicPage.getByLabel("Full name")).toBeVisible({ timeout: 20_000 });

    await publicPage.getByLabel("Full name").fill(name);
    await publicPage.getByLabel("Stanford email").fill(email);
    await publicPage.getByLabel("Phone").fill("6505550199");
    await publicPage.getByLabel("How did you hear about us?").fill("E2E test suite");
    await publicPage.locator("#vertical").selectOption("Marketing");
    await publicPage.locator("#position").selectOption("undergrad");
    await publicPage.getByLabel("Graduation year").fill("2028");
    await publicPage.getByRole("button", { name: "Submit application" }).click();
    await expect(publicPage.getByText("Thanks for applying").first()).toBeVisible({
      timeout: 25_000,
    });
    await publicContext.close();

    const app = await pollConvex<{
      applicationId: string;
      status: string;
      name: string;
      email: string;
      vertical: string;
    }>(
      "e2eHelpers:getLatestCrewApplicationByEmail",
      { email },
      (row) => row?.status === "submitted" && row.email === email,
    );
    expect(app.name).toBe(name);
    expect(app.vertical).toBe("Marketing");

    const adminContext = await browser.newContext({
      storageState: adminAuthFile,
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/dashboard/users/crew-applications");
    await expect(adminPage.getByText(/Crew applications/i).first()).toBeVisible({
      timeout: 25_000,
    });
    await adminPage.getByRole("button", { name: "Submitted" }).click();
    await expect(adminPage.getByText(name).first()).toBeVisible({ timeout: 20_000 });
    await expect(adminPage.getByText(email).first()).toBeVisible();
    await adminContext.close();
  });
});
