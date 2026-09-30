import { expect, type Locator, type Page } from "@playwright/test";
import { pollConvex, runConvex } from "./convex";

export type UserAdminState = {
  userId: string;
  name: string;
  email: string;
  /** The better-auth `user.role` — the field `requireAdmin` actually reads. */
  authRole: string;
  banned: boolean;
  active: boolean;
  status: "active" | "inactive" | "alumni";
  title: string;
  phone: string;
  verticals: string[];
  disciplines: string[];
  defaultOrganizationId: string;
  payrollMethod: string;
  rateMode: string | null;
  storedHourlyRateUsd: number | null;
  effectiveHourlyRateUsd: number | null;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    role: string;
    active: boolean;
  }>;
};

export type InvitationState = {
  invitationId: string;
  email: string;
  status: string;
  role: string;
  organizationId: string;
  expiresAt: number;
  pendingRole: string | null;
  pendingVerticals: string[];
  pendingDisciplines: string[];
  pendingRateMode: string | null;
  pendingCustomHourlyRateUsd: number | null;
  pendingPayrollMethod: string | null;
  hasPendingToken: boolean;
};

export function getUserAdminState(email: string) {
  return runConvex("e2eHelpers:getUserAdminStateByEmail", { email }) as UserAdminState | null;
}

export function waitForUserAdminState(
  email: string,
  predicate: (state: UserAdminState | null) => boolean,
) {
  return pollConvex<UserAdminState>("e2eHelpers:getUserAdminStateByEmail", { email }, predicate);
}

export function waitForInvitationState(
  email: string,
  predicate: (state: InvitationState | null) => boolean,
) {
  return pollConvex<InvitationState>("e2eHelpers:getInvitationStateByEmail", { email }, predicate);
}

export type InvitationSummary = {
  invitationId: string;
  status: string;
  role: string;
  organizationId: string;
  createdAt: number;
};

/**
 * Every invitation row for an email. Unlike `waitForInvitationState`, which
 * returns only the latest match, this exposes duplicates.
 */
export function listInvitationsByEmail(email: string) {
  return runConvex("e2eHelpers:listInvitationsByEmail", { email }) as InvitationSummary[];
}

/**
 * Open the Users page's People tab and return the seeded user's row.
 *
 * The row is addressed by id rather than by matching text: the shared
 * deployment accumulates users, and several of them are named `E2E ...`.
 * The tab lists Active people by default; switch `accessFilter` to reach
 * anyone else.
 */
export async function openUserRow(page: Page, userId: string): Promise<Locator> {
  await page.goto("/dashboard/users");
  await expect(page.getByTestId("people-summary")).toBeVisible({ timeout: 30_000 });
  const row = page.getByTestId(`user-row-${userId}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  return row;
}

/** Open a People row's side panel (profile, access, memberships, crew, email). */
export async function openPersonSheet(page: Page, row: Locator): Promise<Locator> {
  // The row's first button is its main area; the last is the `⋯` menu.
  await row.getByRole("button").first().click();
  const sheet = page.getByTestId("person-sheet");
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  return sheet;
}

/** Open the user's row and then their side panel. */
export async function openUserSheet(page: Page, userId: string) {
  const row = await openUserRow(page, userId);
  const sheet = await openPersonSheet(page, row);
  return { row, sheet };
}

/** Close whichever side panel is open. */
export async function closeSheet(page: Page, sheet: Locator) {
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0, { timeout: 20_000 });
}

/** The status chip at the end of a People row (Active / Inactive / Alumni). */
export function userRowStatus(row: Locator) {
  return row.getByTestId("user-status");
}

/** The panel's Save changes button, enabled only while the panel form is dirty. */
export function personSheetSave(sheet: Locator) {
  return sheet.getByRole("button", { name: "Save changes", exact: true });
}

/** The panel's Hourly rate block, which shows "$X/hr (synced)" for a pinned rate. */
export function personRatePanel(sheet: Locator) {
  return sheet.getByTestId("person-rate");
}

/**
 * Pick an access status from the panel header's status pill. Changing status
 * opens a confirm dialog, so the caller must accept or dismiss it — that is
 * what commits (or abandons) the change.
 */
export async function chooseAccessStatus(page: Page, sheet: Locator, statusName: string) {
  await sheet.getByRole("button", { name: /^Access:/ }).click();
  const option = page.getByRole("menuitemradio", { name: statusName, exact: true });
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
}

/** A button in one of the toggle-group filters above a Users tab list. */
export function toggleFilter(page: Page, groupName: string, optionName: string) {
  return page.getByRole("radiogroup", { name: groupName }).getByRole("radio", { name: optionName, exact: true });
}

/** The People tab's access filter (Active / Inactive / Alumni / All). */
export async function setAccessFilter(page: Page, optionName: string) {
  const option = toggleFilter(page, "Access", optionName);
  await option.click();
  await expect(option).toHaveAttribute("aria-checked", "true");
}

/** The organization filter shared by the People and Invitations tabs. */
export function orgFilter(page: Page) {
  return page.getByTestId("org-filter").getByTestId("searchable-select-trigger");
}

/** Open the header's Add person dialog (invite or create an account). */
export async function openAddPersonDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Add person" }).click();
  const dialog = page.getByTestId("add-person-dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  return dialog;
}
