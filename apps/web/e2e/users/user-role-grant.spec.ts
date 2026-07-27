import { test, expect, type Page } from "@playwright/test";
import { signInWithCredentials } from "../helpers/auth";
import { pickSelectOption } from "../helpers/select";
import {
  cardByTitle,
  ensureManagedUser,
  managedUserPassword,
  managedUsers,
  openUsersAccessPage,
  pollUserState,
  resetManagedUser,
  userRow,
} from "../helpers/users";

/**
 * Granting and revoking admin, watching a refusal flip both ways.
 *
 * Batch 7 proved the app refuses non-admins. What it could not prove is that
 * the refusal is *about the role* — a page that is broken for everyone, or a
 * guard wired to something incidental, passes those tests just as well. This
 * changes one field in the Users table and requires the answer to change with
 * it, in both directions.
 *
 * It runs against its own managed user rather than the shared crew fixture: a
 * failure partway through would otherwise leave `e2e-crew` holding admin, and
 * `auth/admin-route-guards.spec.ts` would start failing for reasons that have
 * nothing to do with the code under test.
 */
test.describe("granting admin flips the refusal", () => {
  // Two browser contexts, a full sign-in, and four page loads.
  test.setTimeout(240_000);

  const email = managedUsers.role;
  const name = "E2E Managed Role";

  test.beforeAll(() => {
    ensureManagedUser(email, name);
  });

  test.afterAll(() => {
    // Deleting outright, rather than demoting, so a failure between the grant
    // and the revoke cannot leave an admin behind on the shared deployment.
    resetManagedUser(email);
  });

  async function expectRefused(memberPage: Page) {
    await memberPage.goto("/dashboard/users");
    await expect(memberPage.getByText("Admin access required").first()).toBeVisible({
      timeout: 30_000,
    });
  }

  async function expectAdmitted(memberPage: Page) {
    await memberPage.goto("/dashboard/users");
    // The card, not the sidebar link of the same name — once the grant lands,
    // "Access & Invites" is on the page twice.
    await expect(cardByTitle(memberPage, "Access & Invites")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByText("Admin access required")).toHaveCount(0);
  }

  test("a member is refused, admitted once promoted, and refused again once demoted", async ({
    page,
    browser,
  }) => {
    // A second, independent session for the person whose role is changing. The
    // admin's own storage state stays on `page`.
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();

    try {
      await signInWithCredentials(memberPage, email, managedUserPassword);
      await expectRefused(memberPage);

      // ---- promote -----------------------------------------------------
      await openUsersAccessPage(page);
      const row = userRow(page, email);
      await expect(row).toBeVisible({ timeout: 25_000 });

      await pickSelectOption(page, row.getByTestId("user-role-trigger"), "Admin");
      await row.getByTestId("user-save").click();

      const promoted = await pollUserState(email, (state) => state?.role === "admin");
      expect(promoted.active).toBe(true);
      // Saving the row also writes the org membership, which is what
      // `ArborOnlyGuard` and the Convex org checks read.
      expect(
        promoted.memberships.some(
          (membership) => membership.organizationName === "Arbor Live" && membership.active,
        ),
      ).toBe(true);

      await expectAdmitted(memberPage);

      // The sidebar has to agree with the guard — an admin who cannot find the
      // page is only marginally better off than one who is refused.
      //
      // Asserted on the sub-link rather than the "Users" parent scoped to
      // `getByRole("navigation")`: that role does not resolve in this sidebar,
      // which makes the `toHaveCount(0)` half of this pair pass for the wrong
      // reason. The link only renders under the `adminOnly` Users menu, and its
      // name does not collide with the card of the same title (a `div`).
      const sidebarUsersLink = memberPage.getByRole("link", {
        name: "Access & Invites",
        exact: true,
      });
      await expect(sidebarUsersLink).toBeVisible({ timeout: 25_000 });

      // ---- demote ------------------------------------------------------
      await openUsersAccessPage(page);
      const demoteRow = userRow(page, email);
      await expect(demoteRow).toBeVisible({ timeout: 25_000 });
      await pickSelectOption(page, demoteRow.getByTestId("user-role-trigger"), "Member");
      await demoteRow.getByTestId("user-save").click();

      await pollUserState(email, (state) => state?.role === "member");

      await expectRefused(memberPage);
      await expect(sidebarUsersLink).toHaveCount(0);
    } finally {
      await memberContext.close();
    }
  });
});
