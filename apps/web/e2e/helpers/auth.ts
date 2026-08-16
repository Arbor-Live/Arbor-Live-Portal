import fs from "fs";
import path from "path";
import { expect, type Locator, type Page } from "@playwright/test";
import { e2eEnv } from "./env";

export const adminAuthFile = path.join(__dirname, "../.auth/admin.json");
export const crewAuthFile = path.join(__dirname, "../.auth/crew.json");
export const bandAuthFile = path.join(__dirname, "../.auth/band.json");

export function ensureAuthDir() {
  fs.mkdirSync(path.dirname(adminAuthFile), { recursive: true });
}

export async function signInWithCredentials(
  page: Page,
  email: string,
  password: string,
) {
  // Turbopack may still be compiling the sign-in chunk on first hit; a native
  // form submit before hydration GETs credentials into the query string.
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page.getByText("Welcome back").waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.getByRole("button", { name: "Sign in to dashboard" })).toBeEnabled({
    timeout: 30_000,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // FormLabel is not htmlFor-associated, so prefer roles over getByLabel.
    await page.getByRole("textbox").first().fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in to dashboard" }).click();

    try {
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
      return;
    } catch (error) {
      const url = page.url();
      const hydratedTooLate = /[?&]password=/.test(url);
      if (!hydratedTooLate || attempt === 1) throw error;
      await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
      await page.getByText("Welcome back").waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
    }
  }
}

export async function signInAsAdmin(page: Page) {
  await signInWithCredentials(page, e2eEnv.adminEmail, e2eEnv.adminPassword);
}

export async function signInAsCrew(page: Page) {
  await signInWithCredentials(page, e2eEnv.crewEmail, e2eEnv.crewPassword);
}

export async function signInAsBand(page: Page) {
  await signInWithCredentials(page, e2eEnv.bandEmail, e2eEnv.bandPassword);
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
  const menu = page.getByTestId("searchable-select-menu");
  await expect(menu).toBeVisible({ timeout: 20_000 });
  await menu.locator("input").first().fill(optionLabel);
  const option = menu.getByRole("option", {
    name: new RegExp(`^${optionLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  }).first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.scrollIntoViewIfNeeded();
  await menu.locator("input").first().press("Enter");
}

function toTimeInputValue(label: string) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label.trim());
  if (!match) return label;
  let hour = Number(match[1]);
  const minute = match[2];
  const pm = match[3].toUpperCase() === "PM";
  if (pm && hour < 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

async function pickCalendarDay(popover: Locator, dayLabel: string) {
  const calendar = popover.locator("[data-slot='calendar']");
  await calendar
    .locator("button:not([data-outside])")
    .filter({ hasText: new RegExp(`^${dayLabel}$`) })
    .click();
}

/** Set a DateTimePicker near a label via the shadcn calendar + time input. */
export async function fillDateTimeNearLabel(
  page: Page,
  label: string,
  options: { dayLabel: string; timeLabel: string },
) {
  const field = page.locator("div.space-y-1").filter({ has: page.getByText(label, { exact: true }) });
  await field.getByTestId("date-time-picker").click();
  const popover = page.locator("[data-slot='popover-content']").last();
  await expect(popover).toBeVisible({ timeout: 5_000 });
  await pickCalendarDay(popover, options.dayLabel);
  await popover.locator("input[type='time']").fill(toTimeInputValue(options.timeLabel));
  await page.keyboard.press("Escape");
}

/** Set a DateTimeRangePicker near a label (event start/end). */
export async function fillDateTimeRangeNearLabel(
  page: Page,
  label: string,
  options: { dayLabel: string; startTime: string; endTime: string; endDayLabel?: string },
) {
  const field = page.locator("div.space-y-1").filter({ has: page.getByText(label, { exact: true }) });
  await field.getByTestId("date-time-range-picker").click();
  const popover = page.locator("[data-slot='popover-content']").last();
  await expect(popover).toBeVisible({ timeout: 5_000 });
  await pickCalendarDay(popover, options.dayLabel);
  if (options.endDayLabel && options.endDayLabel !== options.dayLabel) {
    await pickCalendarDay(popover, options.endDayLabel);
  }
  const times = popover.locator("input[type='time']");
  await times.nth(0).fill(toTimeInputValue(options.startTime));
  await times.nth(1).fill(toTimeInputValue(options.endTime));
  await page.keyboard.press("Escape");
}

/** Accept the in-app confirm/alert (`AppDialogProvider`), not a native `window.confirm`. */
export async function acceptAppDialog(page: Page, confirmName?: string | RegExp) {
  const dialog = page.getByTestId("app-dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog
    .getByRole("button", {
      name: confirmName ?? /^(Continue|Delete|OK)$/,
    })
    .click();
  await expect(dialog).toHaveCount(0);
}

/** Dismiss the in-app confirm. */
export async function dismissAppDialog(page: Page) {
  const dialog = page.getByTestId("app-dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
