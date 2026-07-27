import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { formFieldInput } from "../helpers/forms";
import { pickSelectOption } from "../helpers/select";
import {
  ensureManagedUser,
  managedUsers,
  openUsersAccessPage,
  pollUserState,
  resetManagedUser,
  userRow,
} from "../helpers/users";

type GlobalCrewRates = { normalRateUsd: number; leadRateUsd: number };

/**
 * Per-user compensation, across the two pages that both claim to own it.
 *
 * `setCompensationRate` decides what crew cost on an invoice and what the
 * timecard totals are worth, and it is reachable from two different editors —
 * the Crew Rates page and the Users table — which keep separate forms over the
 * same row. This drives one and reads the other, so the two drifting apart
 * fails here rather than in a quote someone already sent.
 *
 * The global Normal/Lead rates are read, never written. `invoiceSettings.update`
 * writes them for the whole deployment, which on the shared one silently
 * re-prices every other worktree's crew lines — so "pinned to Normal" is
 * asserted against whatever the globals happen to be, not a value this spec set.
 */
test.describe("user compensation rates", () => {
  test.setTimeout(180_000);

  const email = managedUsers.rates;
  const name = "E2E Managed Rates";
  let userId = "";

  test.beforeAll(() => {
    userId = ensureManagedUser(email, name).userId;
  });

  test.afterAll(() => {
    resetManagedUser(email);
  });

  test("custom rate persists, and pinning to Normal follows the global rate", async ({
    page,
  }) => {
    const globals = runConvex("e2eHelpers:getGlobalCrewRates", {}) as GlobalCrewRates;

    await page.goto("/dashboard/users/crew-rates");
    await expect(page.getByText("User Compensation Rates")).toBeVisible({ timeout: 30_000 });

    const row = page.locator(`[data-testid="user-rate-row"][data-user-id="${userId}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });

    // ---- custom --------------------------------------------------------
    await pickSelectOption(page, row.getByTestId("user-rate-mode-trigger"), "Custom", {
      expectTriggerText: /Custom/,
    });
    await formFieldInput(page, row, "Custom USD").fill("47.5");
    await row.getByTestId("user-rate-save").click();

    const custom = await pollUserState(email, (state) => state?.rateMode === "custom");
    expect(custom.customHourlyRateUsd).toBe(47.5);
    expect(custom.effectiveHourlyRateUsd).toBe(47.5);
    await expect(row.getByTestId("user-rate-effective")).toHaveText("Effective: $47.5/hr");

    // ---- pinned to the global Normal rate ------------------------------
    // "Pinned" is the whole point of the mode: the row stops carrying its own
    // number and starts resolving through `invoiceSettings`, so a later change
    // to the global rate moves this user with it.
    await pickSelectOption(page, row.getByTestId("user-rate-mode-trigger"), `Normal ($${globals.normalRateUsd})`, {
      expectTriggerText: /Normal/,
    });
    await row.getByTestId("user-rate-save").click();

    const pinned = await pollUserState(email, (state) => state?.rateMode === "normal");
    expect(pinned.effectiveHourlyRateUsd).toBe(globals.normalRateUsd);

    // ---- the Users table agrees ----------------------------------------
    // A second form over the same row, on a different page. It renders the
    // resolved rate as "(synced)" rather than an editable field, and that
    // number has to be the one the pin resolves to.
    await openUsersAccessPage(page);
    const usersRow = userRow(page, email);
    await expect(usersRow).toBeVisible({ timeout: 25_000 });
    await expect(usersRow.getByTestId("user-synced-rate")).toHaveText(
      `$${globals.normalRateUsd}/hr (synced)`,
      { timeout: 25_000 },
    );

    // Editing from this side has to land on the same record, not a parallel one.
    await pickSelectOption(page, usersRow.getByTestId("user-rate-mode-trigger"), "Custom");
    await usersRow.getByTestId("user-custom-rate-input").fill("52");
    await usersRow.getByTestId("user-save").click();

    const fromUsersTable = await pollUserState(
      email,
      (state) => state?.rateMode === "custom" && state?.customHourlyRateUsd === 52,
    );
    expect(fromUsersTable.effectiveHourlyRateUsd).toBe(52);
  });
});
