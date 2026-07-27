import { test, expect } from "@playwright/test";
import { pickSelectOption, withConfirm } from "../helpers/select";
import {
  ensureManagedUser,
  managedUsers,
  openUsersAccessPage,
  pollUserState,
  resetManagedUser,
  runUserRowAction,
  userDetailsRow,
  userRow,
} from "../helpers/users";

/**
 * Organizations and the memberships that attach people to them.
 *
 * Memberships are what `ArborOnlyGuard`, `BandOnlyGuard`, and every
 * `requireArborInternalContext` check in Convex actually read, and the whole
 * org-type separation Batch 7 asserts is built on them — but nothing in the
 * suite had ever created one through the UI.
 *
 * The organization name is fixed rather than stamped: `createOrganizationAdmin`
 * resolves by slug and returns the existing row, so re-running the spec reuses
 * one organization instead of adding another to a picker every other spec has
 * to scroll past.
 */
test.describe("organizations and user memberships", () => {
  test.setTimeout(180_000);

  const email = managedUsers.membership;
  const name = "E2E Managed Membership";
  const orgName = "E2E Users Org";

  test.beforeAll(() => {
    ensureManagedUser(email, name);
  });

  test.afterAll(() => {
    resetManagedUser(email);
  });

  test("admin creates an org, adds a membership, and cannot strand the default", async ({
    page,
  }) => {
    // ---- create the organization ---------------------------------------
    await page.goto("/dashboard/users/organizations");
    await expect(page.getByText("Organization Management")).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder("New organization name").fill(orgName);
    await page.getByRole("button", { name: "Create Organization" }).click();
    await expect(page.getByText(`Created organization ${orgName}`)).toBeVisible({
      timeout: 25_000,
    });

    // ---- add a membership ----------------------------------------------
    await openUsersAccessPage(page);
    const row = userRow(page, email);
    await expect(row).toBeVisible({ timeout: 25_000 });

    const seeded = await pollUserState(email, (state) => Boolean(state));
    // `ensureCrewUser` puts them in Arbor Live and makes it their default org,
    // which is the state the removal guard below is about.
    expect(seeded.memberships).toHaveLength(1);
    expect(seeded.memberships[0].organizationName).toBe("Arbor Live");

    await runUserRowAction(page, email, "Show details");
    const details = userDetailsRow(page, email);
    await expect(details).toBeVisible({ timeout: 25_000 });

    await pickSelectOption(page, details.getByTestId("membership-org-trigger"), orgName);
    // Picking a non-Arbor org switches the role vocabulary — "Member" is not on
    // offer here, and sending it would be normalized to something else server
    // side.
    await pickSelectOption(page, details.getByTestId("membership-role-trigger"), "Org Member");
    await details.getByRole("button", { name: "Add Membership" }).click();

    const joined = await pollUserState(email, (state) => (state?.memberships.length ?? 0) === 2);
    const added = joined.memberships.find((row) => row.organizationName === orgName);
    expect(added?.role).toBe("org_member");
    expect(added?.active).toBe(true);

    // ---- adding it twice is refused ------------------------------------
    await pickSelectOption(page, details.getByTestId("membership-org-trigger"), orgName);
    const duplicateWarning = await withConfirm(page, "accept", () =>
      details.getByRole("button", { name: "Add Membership" }).click(),
    );
    expect(duplicateWarning).toMatch(/already has membership/i);
    const unchanged = await pollUserState(email, (state) => Boolean(state));
    expect(unchanged.memberships).toHaveLength(2);

    // ---- the default org cannot be removed out from under them ---------
    // Removing it would leave the user with a `defaultOrganizationId` pointing
    // at an org they no longer belong to, which is what `ArborOnlyGuard` reads.
    const arborMembership = details.locator(
      '[data-testid="user-membership"][data-organization-name="Arbor Live"]',
    );
    const strandWarning = await withConfirm(page, "accept", () =>
      arborMembership.getByRole("button", { name: "Remove" }).click(),
    );
    expect(strandWarning).toMatch(/change default organization/i);

    const stillJoined = await pollUserState(email, (state) => Boolean(state));
    expect(
      stillJoined.memberships.some((row) => row.organizationName === "Arbor Live"),
    ).toBe(true);

    // ---- the non-default membership comes off cleanly -------------------
    await details
      .locator(`[data-testid="user-membership"][data-organization-name="${orgName}"]`)
      .getByRole("button", { name: "Remove" })
      .click();

    const left = await pollUserState(email, (state) => (state?.memberships.length ?? 0) === 1);
    expect(left.memberships[0].organizationName).toBe("Arbor Live");
  });
});
