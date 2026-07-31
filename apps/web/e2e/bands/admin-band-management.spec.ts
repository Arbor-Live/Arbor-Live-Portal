import { test, expect, type Page } from "@playwright/test";
import { bandAuthFile, crewAuthFile } from "../helpers/auth";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";
import { formTextarea } from "../helpers/form";
import { pickSelectOption } from "../helpers/select";

function formSaveBar(page: Page) {
  return page.getByRole("status").last();
}

async function ensureBand() {
  return runConvex("e2eHelpers:ensureBandPayeeUser", {
    email: e2eEnv.bandEmail,
    password: e2eEnv.bandPassword,
    name: e2eEnv.bandName,
    bandName: e2eEnv.bandOrgName,
  }) as {
    organizationId: string;
    bandName: string;
  };
}

async function pickAdminBand(page: Page, bandLabel: string) {
  const trigger = page.getByTestId("admin-band-picker");
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  const current = (await trigger.textContent())?.trim() ?? "";
  if (current !== bandLabel) {
    await pickSelectOption(page, trigger, bandLabel);
  }
}

test.describe("admin band profile management", () => {
  test("admin edits a band profile without joining the org", async ({ page }) => {
    await ensureBand();
    const bio = `E2E admin bio ${Date.now()}`;

    await page.goto("/dashboard/bands-and-performers");
    await expect(page.getByText("Manage a band").first()).toBeVisible({ timeout: 30_000 });
    await pickAdminBand(page, e2eEnv.bandOrgName);

    await expect(page.getByText("Band public profile").first()).toBeVisible({ timeout: 20_000 });
    const profileCard = page
      .locator("[data-slot='card']")
      .filter({ hasText: "Band public profile" });
    await formTextarea(profileCard, "Bio").fill(bio);

    const save = formSaveBar(page).getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeVisible({ timeout: 10_000 });
    await save.click();
    // Wait for the mutation to finish before reloading — bar shows "Saved" then may hide.
    await expect(formSaveBar(page).getByText("Saved")).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByText("Manage a band").first()).toBeVisible({ timeout: 30_000 });
    // sessionStorage keeps the selected band across reloads.
    await expect(page.getByTestId("admin-band-picker")).toContainText(e2eEnv.bandOrgName, {
      timeout: 30_000,
    });
    await expect(formTextarea(page.locator("body"), "Bio")).toHaveValue(bio, { timeout: 20_000 });
  });
});

test.describe("admin band rider management", () => {
  test("admin creates a rider for a selected band", async ({ page }) => {
    await ensureBand();
    const riderName = `E2E Admin Rider ${Date.now()}`;

    await page.goto("/dashboard/bands-and-performers/riders");
    await expect(page.getByText("Manage a band").first()).toBeVisible({ timeout: 30_000 });
    await pickAdminBand(page, e2eEnv.bandOrgName);

    await page.getByRole("button", { name: "New rider" }).click();
    await expect(page.getByText("New technical rider").first()).toBeVisible({ timeout: 15_000 });
    await page.locator("#rider-name").fill(riderName);
    await page.getByRole("button", { name: "Create rider" }).click();

    await page.waitForURL(/\/dashboard\/bands-and-performers\/riders\/[^/]+$/, {
      timeout: 45_000,
    });
    await expect(page.getByText("Edit technical rider").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Something went wrong")).toHaveCount(0);

    await page.goto("/dashboard/bands-and-performers/riders");
    await pickAdminBand(page, e2eEnv.bandOrgName);
    await expect(page.getByRole("link", { name: riderName }).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("band self-service riders", () => {
  test.use({ storageState: bandAuthFile });

  test("band member creates and opens a technical rider", async ({ page }) => {
    await ensureBand();
    const riderName = `E2E Band Rider ${Date.now()}`;

    await page.goto("/dashboard/bands-and-performers/riders");
    await expect(page.getByText("Manage a band")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Band Organization Only")).toHaveCount(0);

    const createButton = page
      .getByRole("button", { name: /New rider|Create your first rider/ })
      .first();
    await expect(createButton).toBeVisible({ timeout: 20_000 });
    await createButton.click();
    await expect(page.getByText("New technical rider").first()).toBeVisible({ timeout: 15_000 });
    await page.locator("#rider-name").fill(riderName);
    await page.getByRole("button", { name: "Create rider" }).click();

    await page.waitForURL(/\/dashboard\/bands-and-performers\/riders\/[^/]+$/, {
      timeout: 45_000,
    });
    await expect(page.getByText("Edit technical rider").first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("Users organizations no longer hosts band details", () => {
  test("band org rows link out instead of expanding profile details", async ({ page }) => {
    await ensureBand();

    await page.goto("/dashboard/users/organizations");
    await expect(page.getByText("Band Organizations").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Full profile, payee, and riders live under/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit profile" }).first()).toBeVisible();
    await expect(page.getByRole("option", { name: "Show details" })).toHaveCount(0);
    await expect(page.getByText("Advanced fields")).toHaveCount(0);
  });
});

test.describe("admin sidebar advertises Bands and Performers", () => {
  test("admin sees the section; crew does not", async ({ page, browser }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Home" }).first()).toBeVisible({
      timeout: 30_000,
    });
    // Sidebar parents with subtabs are CollapsibleTriggers (buttons), not links,
    // and the sidebar is not a `navigation` landmark.
    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(
      sidebar.getByRole("button", { name: "Bands and Performers", exact: true }),
    ).toBeVisible();

    const crewContext = await browser.newContext({ storageState: crewAuthFile });
    const crewPage = await crewContext.newPage();
    await crewPage.goto("/dashboard");
    await expect(crewPage.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
    const crewSidebar = crewPage.locator('[data-slot="sidebar"]').first();
    await expect(
      crewSidebar.getByRole("button", { name: "Bands and Performers", exact: true }),
    ).toHaveCount(0);
    await expect(
      crewSidebar.getByRole("link", { name: "Bands and Performers", exact: true }),
    ).toHaveCount(0);
    await crewContext.close();
  });
});
