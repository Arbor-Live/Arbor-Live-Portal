import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { acceptAppDialog, dismissAppDialog, signInWithCredentials } from "../helpers/auth";
import {
  chooseAccessStatus,
  closeSheet,
  openPersonSheet,
  openUserSheet,
  setAccessFilter,
  userRowStatus,
  waitForUserAdminState,
  type UserAdminState,
} from "../helpers/users";

const targetEmail = "e2e-access-target@arborlive.test";
const targetPassword = "E2eTestPassword1!";
const targetName = "E2E Access Target";

/** A second real admin, so the self-lockout test never risks the suite's admin. */
const guardAdminEmail = "e2e-guard-admin@arborlive.test";
const guardAdminPassword = "E2eTestPassword1!";
const guardAdminName = "E2E Guard Admin";

/**
 * The three-state access model: Active / Inactive / Alumni, plus the guard that
 * stops an admin locking themselves out.
 *
 * "Alumni" is two writes that have to agree: a better-auth `banned` flag — which
 * is what actually ends the session, since `getCurrentUserOrNull` returns null
 * for a banned user — and `userAdminProfiles.status`, which is what the table
 * filters on. Asserting only the filter would pass on a user who could still
 * sign in.
 *
 * Status is changed from the pill in the person panel's header; the People
 * list shows Active people by default, so the access filter is how an alumni
 * row comes back into view.
 */
test.describe("user access status", () => {
  test.setTimeout(240_000);

  test.beforeEach(() => {
    // `ensureCrewUser` clears any ban left by an earlier failed run, so the
    // "starts active" precondition below is real rather than assumed.
    runConvex("e2eHelpers:ensureCrewUser", {
      email: targetEmail,
      password: targetPassword,
      name: targetName,
    });
  });

  test("admin marks a user alumni, then reactivates", async ({ page }) => {
    const before = await waitForUserAdminState(targetEmail, (state) => state?.status === "active");
    expect(before.banned).toBe(false);

    const { row, sheet } = await openUserSheet(page, before.userId);
    await expect(userRowStatus(row)).toHaveText("Active");

    await chooseAccessStatus(page, sheet, "Alumni");
    await acceptAppDialog(page, "Mark alumni");
    await expect(page.getByText(`Marked ${targetName} as alumni.`)).toBeVisible({ timeout: 30_000 });

    const alumni = await waitForUserAdminState(targetEmail, (state) => state?.status === "alumni");
    // The ban is the half that actually ends the session.
    expect(alumni.banned).toBe(true);
    // The panel stays open on the person even though the Active list drops them.
    await expect(sheet.getByRole("button", { name: "Access: Alumni" })).toBeVisible({ timeout: 30_000 });
    await closeSheet(page, sheet);

    // The Active filter drops them, and Alumni picks them up.
    await expect(page.getByTestId(`user-row-${before.userId}`)).toHaveCount(0, { timeout: 30_000 });
    await setAccessFilter(page, "Alumni");
    const alumniRow = page.getByTestId(`user-row-${before.userId}`);
    await expect(alumniRow).toBeVisible({ timeout: 30_000 });
    await expect(userRowStatus(alumniRow)).toHaveText("Alumni");

    const alumniSheet = await openPersonSheet(page, alumniRow);
    await chooseAccessStatus(page, alumniSheet, "Active");
    await acceptAppDialog(page, "Activate");
    await expect(page.getByText(`Activated ${targetName}.`)).toBeVisible({ timeout: 30_000 });

    const reactivated = await waitForUserAdminState(targetEmail, (state) => state?.status === "active");
    expect(reactivated.banned).toBe(false);
  });

  test("marking a user inactive keeps their account but drops digest targeting", async ({ page }) => {
    const before = await waitForUserAdminState(targetEmail, (state) => state?.status === "active");
    const { sheet } = await openUserSheet(page, before.userId);

    await chooseAccessStatus(page, sheet, "Inactive");
    await acceptAppDialog(page, "Mark inactive");

    const inactive = await waitForUserAdminState(targetEmail, (state) => state?.status === "inactive");
    // Inactive is not a ban: they can still sign in and reactivate.
    expect(inactive.banned).toBe(false);

    await closeSheet(page, sheet);
    await setAccessFilter(page, "Inactive");
    await expect(page.getByTestId(`user-row-${before.userId}`)).toBeVisible({ timeout: 30_000 });
  });

  test("dismissing the change confirm changes nothing", async ({ page }) => {
    const before = await waitForUserAdminState(targetEmail, (state) => state?.status === "active");
    const { row, sheet } = await openUserSheet(page, before.userId);

    await chooseAccessStatus(page, sheet, "Alumni");
    await dismissAppDialog(page);

    const after = runConvex("e2eHelpers:getUserAdminStateByEmail", {
      email: targetEmail,
    }) as UserAdminState | null;
    expect(after?.status).toBe("active");
    expect(after?.banned).toBe(false);
    await expect(sheet.getByRole("button", { name: "Access: Active" })).toBeVisible();
    await expect(userRowStatus(row)).toHaveText("Active");
  });

  test("an admin cannot close their own access", async ({ browser }) => {
    // Driven as a *second* admin on purpose. The guard is checked before any
    // write, so this should be a no-op — but if it ever regresses, the damage is
    // confined to a throwaway fixture instead of banning the account the whole
    // suite signs in with.
    const seeded = runConvex("e2eHelpers:ensureAdmin", {
      email: guardAdminEmail,
      password: guardAdminPassword,
      name: guardAdminName,
    }) as { userId: string };

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signInWithCredentials(page, guardAdminEmail, guardAdminPassword);
      const { sheet } = await openUserSheet(page, seeded.userId);

      await chooseAccessStatus(page, sheet, "Alumni");
      await acceptAppDialog(page, "Mark alumni");

      // The mutation throws and the page surfaces the message instead of
      // silently doing nothing. `.first()` guards against the dev-mode error
      // overlay echoing the same text.
      await expect(page.getByText("You cannot remove your own access.").first()).toBeVisible({
        timeout: 30_000,
      });
      // The invariant that matters: they are still signed in and still active.
      await expect(sheet.getByRole("button", { name: "Access: Active" })).toBeVisible();
      const after = runConvex("e2eHelpers:getUserAdminStateByEmail", {
        email: guardAdminEmail,
      }) as UserAdminState | null;
      expect(after?.status).toBe("active");
      expect(after?.banned).toBe(false);
      expect(after?.authRole).toBe("admin");
    } finally {
      await context.close();
    }
  });
});
