import { test, expect } from "@playwright/test";
import { pickSelectOption } from "../helpers/select";
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
    await publicPage.getByLabel("What excites you about joining?").fill("E2E test suite");
    // Specialties are scoped per vertical: Marketing offers Design /
    // Photography / Videography, and one is required.
    await pickSelectOption(publicPage, publicPage.locator("#vertical"), "Marketing");
    await pickSelectOption(publicPage, publicPage.locator("#discipline"), "Photography");
    await pickSelectOption(publicPage, publicPage.locator("#position"), "Undergrad");
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
      discipline?: string;
    }>(
      "e2eHelpers:getLatestCrewApplicationByEmail",
      { email },
      (row) => row?.status === "submitted" && row.email === email,
    );
    expect(app.name).toBe(name);
    expect(app.vertical).toBe("Marketing");
    expect(app.discipline).toBe("Photography");

    const adminContext = await browser.newContext({
      storageState: adminAuthFile,
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/dashboard/users/crew-applications");
    await expect(adminPage.getByText(/Crew applications/i).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(adminPage.getByText(name).first()).toBeVisible({ timeout: 20_000 });
    await expect(adminPage.getByText(email).first()).toBeVisible();
    await adminContext.close();
  });

  test("specialty options are scoped to the selected vertical", async ({ browser }) => {
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto("/crew/apply");
    await expect(publicPage.getByLabel("Full name")).toBeVisible({ timeout: 20_000 });

    const specialty = publicPage.locator("#discipline");
    // The specialty picker is a Radix Select: read its options from the open
    // listbox, then close it with Escape.
    const specialtyOptionLabels = async () => {
      await specialty.click();
      const labels = await publicPage.getByRole("option").allTextContents();
      await publicPage.keyboard.press("Escape");
      await expect(publicPage.getByRole("option")).toHaveCount(0);
      return labels.map((label) => label.trim());
    };

    await pickSelectOption(publicPage, publicPage.locator("#vertical"), "Crew");
    expect(await specialtyOptionLabels()).toEqual([
      "Sound",
      "Lights",
      "Photography",
      "Videography",
      "I'm not sure",
    ]);

    await pickSelectOption(publicPage, publicPage.locator("#vertical"), "Marketing");
    expect(await specialtyOptionLabels()).toEqual(["Design", "Photography", "Videography", "I'm not sure"]);

    // Operations and Trivia have no specialties, so the picker disappears.
    await pickSelectOption(publicPage, publicPage.locator("#vertical"), "Operations");
    await expect(specialty).toHaveCount(0);
    await expect(publicPage.getByText("Standing availability", { exact: false })).toHaveCount(0);

    await publicContext.close();
  });
});
