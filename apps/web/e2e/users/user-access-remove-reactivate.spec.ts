import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { signInWithCredentials } from "../helpers/auth";
import { chooseRowAction, pickSelectOption } from "../helpers/select";
import {
  accessFilterSelect,
  openUserRow,
  userRowActionMenu,
  userRowCell,
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
 * Remove access and reactivate (#69), plus the guard that stops an admin
 * locking themselves out.
 *
 * "Removed" is two writes that have to agree: a better-auth `banned` flag —
 * which is what actually ends the session, since `getCurrentUserOrNull` returns
 * null for a banned user — and `userAdminProfiles.active`, which is what the
 * table filters on. Asserting only the filter would pass on a user who could
 * still sign in.
 */
test.describe("user access removal", () => {
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

  test("admin removes access, then reactivates", async ({ page }) => {
    const before = await waitForUserAdminState(targetEmail, (state) => state?.active === true);
    expect(before.banned).toBe(false);

    const row = await openUserRow(page, before.userId);
    await expect(userRowCell.active(row).getByRole("checkbox")).toBeChecked();

    // Behind a `window.confirm`; Playwright dismisses dialogs by default, so
    // without this the mutation is never even requested.
    page.once("dialog", (dialog) => void dialog.accept());
    await chooseRowAction(page, userRowActionMenu(row), "Remove access");

    await expect(page.getByText(`Removed access for ${targetName}.`)).toBeVisible({
      timeout: 30_000,
    });
    const removed = await waitForUserAdminState(targetEmail, (state) => state?.active === false);
    // The ban is the half that actually ends the session.
    expect(removed.banned).toBe(true);

    // The default Active filter drops them, and Removed picks them up.
    await expect(page.getByTestId(`user-row-${before.userId}`)).toHaveCount(0, { timeout: 30_000 });
    await pickSelectOption(page, accessFilterSelect(page), "Removed");
    const removedRow = page.getByTestId(`user-row-${before.userId}`);
    await expect(removedRow).toBeVisible({ timeout: 30_000 });
    await expect(removedRow).toContainText("Removed");

    page.once("dialog", (dialog) => void dialog.accept());
    await chooseRowAction(page, userRowActionMenu(removedRow), "Reactivate");

    await expect(page.getByText(`Reactivated ${targetName}.`)).toBeVisible({ timeout: 30_000 });
    const reactivated = await waitForUserAdminState(targetEmail, (state) => state?.active === true);
    expect(reactivated.banned).toBe(false);

    // Reactivating is only real if it also puts them back in the Active list.
    await pickSelectOption(page, accessFilterSelect(page), "Active");
    await expect(page.getByTestId(`user-row-${before.userId}`)).toBeVisible({ timeout: 30_000 });
  });

  test("dismissing the remove confirm changes nothing", async ({ page }) => {
    const before = await waitForUserAdminState(targetEmail, (state) => state?.active === true);
    const row = await openUserRow(page, before.userId);

    page.once("dialog", (dialog) => void dialog.dismiss());
    await chooseRowAction(page, userRowActionMenu(row), "Remove access");

    // Still listed under the Active filter, and still unbanned.
    await expect(row).toBeVisible();
    await expect(userRowCell.active(row).getByRole("checkbox")).toBeChecked();
    const after = runConvex("e2eHelpers:getUserAdminStateByEmail", {
      email: targetEmail,
    }) as UserAdminState | null;
    expect(after?.active).toBe(true);
    expect(after?.banned).toBe(false);
  });

  test("an admin cannot remove their own access", async ({ browser }) => {
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
      const row = await openUserRow(page, seeded.userId);

      page.once("dialog", (dialog) => void dialog.accept());
      await chooseRowAction(page, userRowActionMenu(row), "Remove access");

      // The mutation throws and the page surfaces the message instead of
      // silently doing nothing. `.first()` guards against the dev-mode error
      // overlay echoing the same text.
      await expect(page.getByText("You cannot remove your own access.").first()).toBeVisible({
        timeout: 30_000,
      });
      // The invariant that matters: they are still signed in and still active.
      await expect(row).toBeVisible();
      await expect(userRowCell.active(row).getByRole("checkbox")).toBeChecked();
      const after = runConvex("e2eHelpers:getUserAdminStateByEmail", {
        email: guardAdminEmail,
      }) as UserAdminState | null;
      expect(after?.active).toBe(true);
      expect(after?.banned).toBe(false);
      expect(after?.authRole).toBe("admin");
    } finally {
      await context.close();
    }
  });
});

