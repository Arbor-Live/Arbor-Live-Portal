import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { crewAuthFile, signInWithCredentials } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { formField, selectByLabel } from "../helpers/form";
import { pickSelectOption } from "../helpers/select";
import {
  openUserRow,
  userRowRoleSelect,
  userRowSave,
  waitForUserAdminState,
} from "../helpers/users";

const targetEmail = "e2e-promote-target@arborlive.test";
const targetPassword = "E2eTestPassword1!";
const targetName = "E2E Promote Target";

/**
 * Direct user creation, then the role grant that Batch 7's refusals depend on.
 *
 * Batch 7 proved a non-admin is refused on the admin routes, but nothing proved
 * the *grant* works — a guard that refused everyone would have passed it just as
 * happily. This drives the whole loop through the UI: create a member, watch
 * them get refused, promote them from the Users table, watch the same session
 * walk in, then demote and watch the door shut again.
 *
 * Admin-ness is one field: `requireAdmin` compares the better-auth `user.role`,
 * and `AdminOnlyGuard` reads the same value through `getSessionShell`. The
 * Users row writes it alongside `userOrganizationMemberships.role`, so both are
 * asserted — they are separate values that can drift.
 */
test.describe("create user and grant admin", () => {
  // A sign-in, three Convex polls, and six page loads across two contexts.
  test.setTimeout(300_000);

  test("created member is refused, promoted admin gets in, demoted is refused again", async ({
    page,
    browser,
  }) => {
    // A stable address rather than a stamped one: this spec has to sign in as
    // the user, and `createUserAdmin` only writes a credential account when the
    // user is new, so a fresh email every run would leave a pile of accounts
    // behind. Re-running instead resets the existing user's role to `member`,
    // which is exactly the precondition the spec needs.
    await page.goto("/dashboard/users/access");
    await expect(page.getByText("User Access & Invitations")).toBeVisible({ timeout: 30_000 });

    const invitationsCard = page
      .locator("[data-slot='card']")
      .filter({ has: page.getByText("Invitations", { exact: true }) });
    await expect(invitationsCard.locator("[data-slot='select-trigger']").first()).toHaveText(
      "Arbor Live",
      { timeout: 30_000 },
    );
    await invitationsCard.getByRole("button", { name: "Create User" }).click();

    const modal = page.getByTestId("create-user-modal");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await formField(modal, "Name").fill(targetName);
    await formField(modal, "Title (optional)").fill("E2E Fixture");
    await formField(modal, "Email").fill(targetEmail);
    await formField(modal, "Temporary password").fill(targetPassword);
    // Leave Role on Member — being refused first is the point.
    await pickSelectOption(page, selectByLabel(modal, "Payment method"), "Stanford payroll");
    await modal.getByRole("button", { name: "Create User" }).click();

    await expect(page.getByText("User created.")).toBeVisible({ timeout: 30_000 });

    const created = await waitForUserAdminState(
      targetEmail,
      (state) => state?.authRole === "member",
    );
    expect(created.name).toBe(targetName);
    expect(created.title).toBe("E2E Fixture");
    expect(created.active).toBe(true);
    expect(created.banned).toBe(false);
    expect(created.payrollMethod).toBe("stanford");
    // Created into the org that was selected, not orphaned.
    expect(
      created.memberships.some(
        (membership) => membership.organizationName === "Arbor Live" && membership.active,
      ),
    ).toBe(true);

    // Sign in as the user we just created, in their own context.
    const targetContext = await browser.newContext();
    const targetPage = await targetContext.newPage();
    try {
      await signInWithCredentials(targetPage, targetEmail, targetPassword);

      await targetPage.goto("/dashboard/users");
      await expect(targetPage.getByText("Admin access required").first()).toBeVisible({
        timeout: 30_000,
      });

      // Promote from the Users table.
      const row = await openUserRow(page, created.userId);
      await pickSelectOption(page, userRowRoleSelect(row), "Admin");
      await userRowSave(row).click();

      const promoted = await waitForUserAdminState(
        targetEmail,
        (state) => state?.authRole === "admin",
      );
      // The row saves the auth role and the org membership role together.
      expect(
        promoted.memberships.some(
          (membership) => membership.organizationName === "Arbor Live" && membership.role === "admin",
        ),
      ).toBe(true);

      // Same session, same cookie — only the role moved. There is no session
      // cookie cache configured, so a reload is enough to pick it up.
      await targetPage.reload();
      await expect(targetPage.getByText("Admin access required")).toHaveCount(0, {
        timeout: 30_000,
      });
      await expect(targetPage.getByRole("link", { name: "Open Access Management" })).toBeVisible({
        timeout: 30_000,
      });

      // Demote, which also leaves the fixture in the state the next run expects.
      const demoteRow = await openUserRow(page, created.userId);
      await pickSelectOption(page, userRowRoleSelect(demoteRow), "Member");
      await userRowSave(demoteRow).click();
      await waitForUserAdminState(targetEmail, (state) => state?.authRole === "member");

      await targetPage.reload();
      await expect(targetPage.getByText("Admin access required").first()).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await targetContext.close();
    }
  });

  test.afterAll(() => {
    // Belt and braces: if the promote test failed between promote and demote,
    // leave no extra admin behind on the shared deployment.
    const state = runConvex("e2eHelpers:getUserAdminStateByEmail", {
      email: targetEmail,
    }) as { userId: string; authRole: string } | null;
    if (state?.authRole === "admin") {
      runConvex("e2eHelpers:setAuthUserRole", { email: targetEmail, role: "member" });
    }
  });
});

/**
 * The Users sub-routes Batch 7 missed.
 *
 * Its route list came from the sidebar's `adminOnly` flags, and these three are
 * reached from cards on `/dashboard/users` instead of from the nav — so they had
 * no `AdminOnlyGuard` at all and refused by throwing `requireAdmin` into the
 * generic error boundary. This batch adds the guard; this pins it.
 *
 * Reuses the standing crew session rather than signing in: the crew user is a
 * real `arbor_internal` member and not an admin, which is exactly the case these
 * pages have to refuse.
 */
test.describe("Users sub-route guards", () => {
  test.use({ storageState: crewAuthFile });

  test.beforeAll(() => {
    runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    });
  });

  for (const path of [
    "/dashboard/users/access",
    "/dashboard/users/organizations",
    "/dashboard/users/crew-rates",
  ]) {
    test(`non-admin crew is refused on ${path}`, async ({ page }) => {
      await page.goto(path);
      // `ArborOnlyGuard` passes — they are a real Arbor member — and
      // `AdminOnlyGuard` refuses. The refusal has to read as a refusal.
      await expect(page.getByText("Admin access required").first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
    });
  }
});
