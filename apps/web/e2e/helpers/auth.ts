import fs from "fs";
import path from "path";
import { expect, type Page } from "@playwright/test";
import { e2eEnv } from "./env";

export const adminAuthFile = path.join(__dirname, "../.auth/admin.json");
export const crewAuthFile = path.join(__dirname, "../.auth/crew.json");

export function ensureAuthDir() {
  fs.mkdirSync(path.dirname(adminAuthFile), { recursive: true });
}

export async function signInWithCredentials(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto("/sign-in");
  await page.getByText("Welcome back").waitFor({ state: "visible" });
  // FormLabel is not htmlFor-associated, so prefer roles over getByLabel.
  await page.getByRole("textbox").first().fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in to dashboard" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

export async function signInAsAdmin(page: Page) {
  await signInWithCredentials(page, e2eEnv.adminEmail, e2eEnv.adminPassword);
}

export async function signInAsCrew(page: Page) {
  await signInWithCredentials(page, e2eEnv.crewEmail, e2eEnv.crewPassword);
}

export async function completeFirstAdminSetup(page: Page) {
  await page.goto("/setup");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Your name").fill(e2eEnv.adminName);
  await page.getByLabel("Email").fill(e2eEnv.adminEmail);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Password", { exact: true }).fill(e2eEnv.adminPassword);
  await page.getByLabel("Confirm password").fill(e2eEnv.adminPassword);
  await page.getByRole("button", { name: "Create admin account" }).click();
  await page.getByRole("button", { name: "Go to dashboard" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/** Pick a SearchableSelect by nearby label text, then choose an option label. */
export async function selectSearchableOption(
  page: Page,
  label: string,
  optionLabel: string,
) {
  const field = page.locator("div.space-y-1").filter({ has: page.getByText(label, { exact: true }) });
  await field.getByTestId("searchable-select-trigger").click();
  const menu = page.locator("body > div").filter({ has: page.getByPlaceholder(/Search/i) }).last();
  await menu.getByPlaceholder(/Search/i).fill(optionLabel);
  await page.getByRole("button", { name: optionLabel, exact: true }).click();
}

/** Set a DateTimePicker near a label via the react-datepicker calendar UI. */
export async function fillDateTimeNearLabel(
  page: Page,
  label: string,
  options: { dayLabel: string; timeLabel: string },
) {
  const field = page.locator("div.space-y-1").filter({ has: page.getByText(label, { exact: true }) });
  const input = field.getByTestId("date-time-picker");
  await input.click();
  const popper = page.locator(".app-date-time-popper, .react-datepicker-popper").last();
  await expect(popper).toBeVisible({ timeout: 5_000 });
  await popper
    .locator(
      `.react-datepicker__day:not(.react-datepicker__day--outside-month):text-is("${options.dayLabel}")`,
    )
    .first()
    .click();
  await popper
    .locator(".react-datepicker__time-list-item")
    .filter({ hasText: new RegExp(`^\\s*${options.timeLabel}\\s*$`) })
    .first()
    .click({ force: true });
  await page.keyboard.press("Escape");
}
