import { expect, type Locator, type Page } from "@playwright/test";
import { pollConvex, runConvex } from "./convex";
import { pickSelectOption } from "./select";

/**
 * Fixed addresses the Batch 9 specs own outright.
 *
 * Every other suite seeds a uniquely stamped row per run, but users cannot work
 * that way: `users.listUsersForAdmin` returns *every* auth user into an
 * unpaginated table, so a throwaway user per run would grow the shared
 * deployment's Users page forever. These specs reuse one address each and reset
 * it, which keeps the footprint flat no matter how many times the suite runs.
 *
 * `e2e-managed-` rather than `e2e-`: the shared admin, crew, and band fixtures
 * are all `e2e-*@arborlive.test`, and `resetManagedUser` hard-deletes. The
 * matching Convex helper refuses anything outside this prefix.
 */
export const managedUsers = {
  invite: "e2e-managed-invite@arborlive.test",
  created: "e2e-managed-created@arborlive.test",
  role: "e2e-managed-role@arborlive.test",
  rates: "e2e-managed-rates@arborlive.test",
  membership: "e2e-managed-membership@arborlive.test",
} as const;

export const managedUserPassword = "E2eManagedPassword1!";

export type UserAdminState = {
  userId: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  active: boolean;
  title: string | null;
  phone: string | null;
  verticals: string[];
  disciplines: string[];
  payrollMethod: string | null;
  rateMode: string | null;
  customHourlyRateUsd: number | null;
  effectiveHourlyRateUsd: number | null;
  onboardingStatus: string | null;
  defaultOrganizationId: string | null;
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
  role: string;
  status: string;
  organizationId: string;
  createdAt: number;
  expiresAt: number;
  verticals: string[];
  disciplines: string[];
  rateMode: string | null;
  payrollMethod: string | null;
};

/** Delete a managed user everywhere, so the run starts from "does not exist". */
export function resetManagedUser(email: string) {
  return runConvex("e2eHelpers:resetManagedUserByEmail", { email }) as {
    email: string;
    deletedUser: boolean;
    deletedRows: number;
  };
}

/**
 * Recreate a managed user as an ordinary, signed-in-able Arbor member.
 *
 * `ensureCrewUser` is reused rather than reimplemented — it already waives
 * onboarding, which a fresh user needs before they can be driven through the
 * dashboard. It is preceded by a reset because it only *upserts*: a user left
 * behind as an admin by a previous run would stay an admin, and the role-grant
 * spec's opening assertion is that they are refused.
 */
export function ensureManagedUser(email: string, name: string) {
  resetManagedUser(email);
  return runConvex("e2eHelpers:ensureCrewUser", {
    email,
    password: managedUserPassword,
    name,
  }) as { userId: string; organizationId: string };
}

export function getUserState(email: string) {
  return runConvex("e2eHelpers:getUserAdminStateByEmail", { email }) as UserAdminState | null;
}

export function pollUserState(
  email: string,
  predicate: (state: UserAdminState | null) => boolean,
) {
  return pollConvex<UserAdminState>("e2eHelpers:getUserAdminStateByEmail", { email }, predicate);
}

export function pollInvitationState(
  email: string,
  predicate: (state: InvitationState | null) => boolean,
) {
  return pollConvex<InvitationState>(
    "e2eHelpers:getInvitationStateByEmail",
    { email },
    predicate,
  );
}

/**
 * Open Access & Invitations with Arbor Live selected.
 *
 * The org picker defaults to the alphabetically first organization, not to
 * Arbor Live, and that choice changes the page's behaviour rather than just its
 * filtering: `isArborOrg` decides whether roles read Member/Admin or Org
 * Member/Org Admin, and whether the invite form offers rate and payroll at all.
 * Every users spec therefore pins the org explicitly.
 */
export async function openUsersAccessPage(page: Page) {
  await page.goto("/dashboard/users/access");
  // `CardTitle` renders a plain `div`, so none of these headings are headings
  // as far as roles are concerned — address the card itself.
  await expect(cardByTitle(page, "Invitations")).toBeVisible({ timeout: 30_000 });
  await pickSelectOption(page, page.getByTestId("invitations-org-trigger"), "Arbor Live");
}

/**
 * A card addressed by its exact `CardTitle`.
 *
 * Both halves matter. Matching on any text inside the card catches two at once
 * — "Invite User" is the modal's title *and* the label of the button in the
 * Invitations card that opens it — so this matches only the title slot. And the
 * match is anchored, because "Invitations" is a substring of the page header's
 * "User Access & Invitations".
 */
export function cardByTitle(page: Page, title: string): Locator {
  const exact = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return page
    .locator("[data-slot='card']")
    .filter({ has: page.locator("[data-slot='card-title']", { hasText: exact }) });
}

/** The Users table row for one person, scoped by the email it renders. */
export function userRow(page: Page, email: string): Locator {
  return page.locator(`[data-testid="user-row"][data-user-email="${email}"]`);
}

/** The expanded "Advanced fields" row that follows a user's row. */
export function userDetailsRow(page: Page, email: string): Locator {
  return page.locator(`[data-testid="user-details-row"][data-user-email="${email}"]`);
}

/** The Invitations table row for one email. */
export function invitationRow(page: Page, email: string): Locator {
  return page.locator(`[data-testid="invitation-row"][data-invite-email="${email}"]`);
}

/**
 * Run one of the per-row actions from the Options menu.
 *
 * The menu is a Radix `Select` whose value is always `""`, so it never reflects
 * the action taken — `expectTriggerText: false` stops the helper waiting for a
 * trigger label that will never change.
 */
export async function runUserRowAction(page: Page, email: string, action: string) {
  await pickSelectOption(page, userRow(page, email).getByTestId("user-actions-trigger"), action, {
    expectTriggerText: false,
  });
}
