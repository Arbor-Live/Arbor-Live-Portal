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

/**
 * Open `/dashboard/users/access` and return the seeded user's table row.
 *
 * The row is addressed by id rather than by matching text: the shared
 * deployment accumulates users, and several of them are named `E2E ...`.
 */
export async function openUserRow(page: Page, userId: string): Promise<Locator> {
  await page.goto("/dashboard/users/access");
  await expect(page.getByText("User Access & Invitations")).toBeVisible({ timeout: 30_000 });
  const row = page.getByTestId(`user-row-${userId}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  return row;
}

/**
 * Cells of a Users table row, by the column headers the table itself renders:
 * Name, Email, Role, Onboarding, Active, Options.
 *
 * Title / Phone / Hourly Rate / Default Org live in the expanded details panel
 * (`user-details-{id}` / `user-rate-{id}`).
 */
export const userRowCell = {
  role: (row: Locator) => row.locator("td").nth(2),
  active: (row: Locator) => row.locator("td").nth(4),
  options: (row: Locator) => row.locator("td").nth(5),
};

export function userDetailsPanel(page: Page, userId: string) {
  return page.getByTestId(`user-details-${userId}`);
}

export function userRatePanel(page: Page, userId: string) {
  return page.getByTestId(`user-rate-${userId}`);
}

/** The row's Save button, which only exists while the row form is dirty. */
export function userRowSave(row: Locator) {
  return userRowCell.options(row).getByRole("button", { name: "Save", exact: true });
}

/**
 * The row's "Select..." menu (reset password, show details, waive onboarding,
 * remove access / reactivate). Drive it with `chooseRowAction`, not
 * `pickSelectOption` — its value is pinned to `""`, so the trigger text never
 * changes.
 */
export function userRowActionMenu(row: Locator) {
  return userRowCell.options(row).locator("[data-slot='select-trigger']");
}

/** The Role select in a Users table row. */
export function userRowRoleSelect(row: Locator) {
  return userRowCell.role(row).locator("[data-slot='select-trigger']");
}

/** The "Access" filter above the Users table (Active / Removed / All). */
export function accessFilterSelect(page: Page) {
  return page
    .locator("div.space-y-1")
    .filter({ has: page.getByText("Access", { exact: true }) })
    .locator("[data-slot='select-trigger']");
}
