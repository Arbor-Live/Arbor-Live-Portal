import { test, expect, type Locator } from "@playwright/test";
import { acceptAppDialog } from "../helpers/auth";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";
import { chooseRowAction, pickSelectOption } from "../helpers/select";
import {
  openUserRow,
  userRowActionMenu,
  waitForUserAdminState,
  type UserAdminState,
} from "../helpers/users";

const targetEmail = "e2e-membership-target@arborlive.test";
const targetPassword = "E2eTestPassword1!";
const targetName = "E2E Membership Target";

const hasBandMembership = (state: UserAdminState | null) =>
  (state?.memberships ?? []).some(
    (membership) => membership.organizationName === e2eEnv.bandOrgName,
  );

/** Click the Remove button on the membership line for one org. */
async function removeMembership(panel: Locator, organizationName: string) {
  const line = panel.locator("div.flex.items-center").filter({ hasText: organizationName });
  await line.getByRole("button", { name: "Remove", exact: true }).click();
}

/**
 * Org memberships from the Users row's expanded details.
 *
 * A user's memberships are what `getSessionShell` turns into their org switcher
 * and their active org, so `addUserOrganizationMembershipAdmin` is how anyone
 * reaches a band portal at all — and the band-only/Arbor-only separation that
 * `auth/org-context-guards.spec.ts` asserts is downstream of these rows.
 *
 * The band org seeded by `band.setup.ts` is reused as the second org rather than
 * creating one: `createOrganizationAdmin` would leave a new org behind on every
 * run, and orgs appear in the pickers of every other spec.
 */
test.describe.serial("user organization memberships", () => {
  test.setTimeout(180_000);

  test("admin adds a band-org membership, then removes it", async ({ page }) => {
    runConvex("e2eHelpers:ensureCrewUser", {
      email: targetEmail,
      password: targetPassword,
      name: targetName,
    });
    const seeded = await waitForUserAdminState(targetEmail, (state) => Boolean(state?.userId));
    // Fixture invariant the rest of this spec leans on: Arbor Live is their
    // default org, so the band membership below is genuinely a second one.
    expect(seeded.defaultOrganizationId).toBeTruthy();

    const row = await openUserRow(page, seeded.userId);
    await chooseRowAction(page, userRowActionMenu(row), "Show details");

    const panel = page.getByTestId(`user-memberships-${seeded.userId}`);
    await expect(panel).toBeVisible({ timeout: 30_000 });

    // A previous run that failed between add and remove would leave the band
    // membership behind, and `addUserOrganizationMembershipAdmin` throws on a
    // duplicate — so clear it first rather than failing for last week's reason.
    if (hasBandMembership(seeded)) {
      await removeMembership(panel, e2eEnv.bandOrgName);
      await waitForUserAdminState(targetEmail, (state) => !hasBandMembership(state));
    }
    const baseline = await waitForUserAdminState(targetEmail, (state) => !hasBandMembership(state));

    const orgSelect = panel.locator("[data-slot='select-trigger']").nth(0);
    const roleSelect = panel.locator("[data-slot='select-trigger']").nth(1);

    // Picking the org rewrites the role options — an external org offers
    // Org Member / Org Admin where Arbor Live offers Member / Admin — and the
    // role select is disabled until an org is chosen, so the order matters.
    await pickSelectOption(page, orgSelect, e2eEnv.bandOrgName);
    await pickSelectOption(page, roleSelect, "Org Admin");
    await panel.getByRole("button", { name: "Add Membership" }).click();

    await expect(page.getByText(`Added membership for ${targetName}.`)).toBeVisible({
      timeout: 30_000,
    });
    const added = await waitForUserAdminState(targetEmail, hasBandMembership);
    const bandMembership = added.memberships.find(
      (membership) => membership.organizationName === e2eEnv.bandOrgName,
    );
    expect(bandMembership?.role).toBe("org_admin");
    expect(bandMembership?.active).toBe(true);
    // Additive: the Arbor membership is untouched, the user is not moved.
    expect(added.memberships.length).toBe(baseline.memberships.length + 1);

    await expect(panel).toContainText(`${e2eEnv.bandOrgName} (org_admin)`, { timeout: 30_000 });

    await removeMembership(panel, e2eEnv.bandOrgName);
    await expect(page.getByText(`Removed membership for ${targetName}.`)).toBeVisible({
      timeout: 30_000,
    });
    const removed = await waitForUserAdminState(targetEmail, (state) => !hasBandMembership(state));
    expect(removed.memberships.length).toBe(baseline.memberships.length);
  });

  test("removing the default org membership is refused", async ({ page }) => {
    // Otherwise the user keeps a default org they are not a member of, which is
    // how a session ends up with no active organization at all. The refusal is
    // an in-app alert — a refused click and a broken click look identical
    // without asserting the dialog.
    const before = await waitForUserAdminState(targetEmail, (state) => Boolean(state?.userId));
    const defaultOrg = before.memberships.find(
      (membership) => membership.organizationId === before.defaultOrganizationId,
    );
    expect(defaultOrg?.organizationName).toBe("Arbor Live");

    const row = await openUserRow(page, before.userId);
    await chooseRowAction(page, userRowActionMenu(row), "Show details");
    const panel = page.getByTestId(`user-memberships-${before.userId}`);
    await expect(panel).toBeVisible({ timeout: 30_000 });

    await removeMembership(panel, "Arbor Live");
    const dialog = page.getByTestId("app-dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText("Change default organization before removing this membership.");
    await acceptAppDialog(page, "OK");

    const after = runConvex("e2eHelpers:getUserAdminStateByEmail", {
      email: targetEmail,
    }) as UserAdminState | null;
    expect(
      (after?.memberships ?? []).some(
        (membership) => membership.organizationId === before.defaultOrganizationId,
      ),
    ).toBe(true);
  });
});
