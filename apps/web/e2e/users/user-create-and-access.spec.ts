import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";
import { formFieldInput } from "../helpers/forms";
import { pickSelectOption, withConfirm } from "../helpers/select";
import {
  cardByTitle,
  managedUserPassword,
  managedUsers,
  openUsersAccessPage,
  pollUserState,
  resetManagedUser,
  runUserRowAction,
  userRow,
} from "../helpers/users";

/**
 * Creating a user outright, then removing and restoring their access.
 *
 * Every other spec in the suite gets its users from `e2eHelpers`, which writes
 * Better Auth rows directly — so `createUserAdmin` (which also has to hash a
 * password, attach a credential account, and join an organization) had no
 * coverage at all, and neither did the access toggle that Batch 7's refusals
 * ultimately rest on.
 */
test.describe("create user and manage access", () => {
  // Create, three access transitions, and a filter switch, each waiting on the
  // shared deployment.
  test.setTimeout(180_000);

  const email = managedUsers.created;
  const name = "E2E Managed Created";

  test.beforeAll(() => {
    resetManagedUser(email);
  });

  test("admin creates a user, removes access, then reactivates", async ({ page }) => {
    await openUsersAccessPage(page);

    await cardByTitle(page, "Invitations").getByRole("button", { name: "Create User" }).click();
    const modal = cardByTitle(page, "Create User (Direct)");
    await expect(modal).toBeVisible({ timeout: 25_000 });

    await formFieldInput(page, modal, "Name").fill(name);
    await formFieldInput(page, modal, "Title (optional)").fill("E2E Technician");
    await formFieldInput(page, modal, "Email").fill(email);
    await formFieldInput(page, modal, "Temporary password").fill(managedUserPassword);
    await pickSelectOption(page, page.getByTestId("create-user-role-trigger"), "Member");
    await pickSelectOption(page, page.getByTestId("create-user-rate-mode-trigger"), "Custom");
    await formFieldInput(page, modal, "Custom hourly rate (USD)").fill("41.25");
    await pickSelectOption(
      page,
      page.getByTestId("create-user-payroll-trigger"),
      "External payroll",
    );
    await modal.getByLabel("Crew", { exact: true }).check();
    await modal.getByLabel("Lights", { exact: true }).check();

    await modal.getByRole("button", { name: "Create User" }).click();

    const created = await pollUserState(email, (state) => Boolean(state));
    expect(created.name).toBe(name);
    expect(created.role).toBe("member");
    expect(created.active).toBe(true);
    expect(created.banned).toBe(false);
    expect(created.title).toBe("E2E Technician");
    expect(created.verticals).toContain("Crew");
    expect(created.disciplines).toContain("Lights");
    // Compensation is part of creating a person, not a later edit — a user
    // created without it silently prices at $0 on every invoice crew line.
    expect(created.rateMode).toBe("custom");
    expect(created.customHourlyRateUsd).toBe(41.25);
    expect(created.payrollMethod).toBe("external");
    expect(created.memberships.some((row) => row.organizationName === "Arbor Live")).toBe(true);

    const row = userRow(page, email);
    await expect(row).toBeVisible({ timeout: 25_000 });

    // ---- remove access, declined ---------------------------------------
    const declined = await withConfirm(page, "dismiss", () =>
      runUserRowAction(page, email, "Remove access"),
    );
    expect(declined).toContain(name);

    const untouched = await pollUserState(email, (state) => Boolean(state));
    expect(untouched.active).toBe(true);
    expect(untouched.banned).toBe(false);

    // ---- remove access, confirmed --------------------------------------
    await withConfirm(page, "accept", () => runUserRowAction(page, email, "Remove access"));

    const removed = await pollUserState(email, (state) => state?.active === false);
    // Both halves matter: `active` is what the app reads, `banned` is what
    // Better Auth reads when refusing the sign-in.
    expect(removed.banned).toBe(true);

    // The default filter is Active, so a removed user leaves the table.
    await expect(userRow(page, email)).toHaveCount(0, { timeout: 25_000 });

    await pickSelectOption(page, page.getByTestId("user-access-filter"), "Removed");
    await expect(userRow(page, email)).toBeVisible({ timeout: 25_000 });
    await expect(userRow(page, email)).toContainText("Removed");

    // ---- reactivate ----------------------------------------------------
    await withConfirm(page, "accept", () => runUserRowAction(page, email, "Reactivate"));

    const restored = await pollUserState(email, (state) => state?.active === true);
    expect(restored.banned).toBe(false);
  });
});

/**
 * The guard that stops an admin locking themselves out.
 *
 * Worth its own block because of what a regression here would do on the shared
 * deployment: if `assertCanChangeUserAccess` ever stopped throwing, this spec
 * would ban the account every other spec signs in with. The `afterAll` restores
 * access unconditionally, from outside the auth path being tested, so a broken
 * guard fails this one test instead of the whole suite.
 */
test.describe("admins cannot remove their own access", () => {
  test.afterAll(() => {
    runConvex("e2eHelpers:setUserAccessByEmail", {
      email: e2eEnv.adminEmail,
      removed: false,
    });
  });

  test("the admin's own row refuses removal and says why", async ({ page }) => {
    await openUsersAccessPage(page);

    const ownRow = userRow(page, e2eEnv.adminEmail);
    await expect(ownRow).toBeVisible({ timeout: 25_000 });

    const asked = await withConfirm(page, "accept", () =>
      runUserRowAction(page, e2eEnv.adminEmail, "Remove access"),
    );
    expect(asked).toContain("Remove access for");

    // The refusal comes back from Convex and is surfaced, not swallowed.
    await expect(page.getByText(/cannot remove your own access/i)).toBeVisible({
      timeout: 25_000,
    });

    const stillActive = await pollUserState(e2eEnv.adminEmail, (state) => Boolean(state));
    expect(stillActive.active).toBe(true);
    expect(stillActive.banned).toBe(false);
  });
});
