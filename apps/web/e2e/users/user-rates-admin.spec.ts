import { test, expect, type Locator } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { formField } from "../helpers/form";
import { chooseRowAction, pickSelectOption } from "../helpers/select";
import {
  userRatePanel,
  userRowActionMenu,
  waitForUserAdminState,
} from "../helpers/users";

const targetEmail = "e2e-rates-target@arborlive.test";
const targetPassword = "E2eTestPassword1!";
const targetName = "E2E Rates Target";

type GlobalCrewRates = { normalRateUsd: number; leadRateUsd: number };

/**
 * Per-user compensation rates on `/dashboard/users/crew-rates`.
 *
 * `setCompensationRate` feeds two things downstream — timecard cost and the crew
 * lines on an invoice — and it has two modes that behave very differently:
 * `custom` stores a number, while `normal`/`lead` store nothing and resolve
 * against the global rates at read time. Asserting the stored number alone would
 * miss a pinned user resolving to the wrong rate, so this checks both the stored
 * value and the resolved one.
 *
 * The global rates are read, never written: `invoiceSettings.update` is global,
 * so on the shared deployment writing it silently re-prices every other
 * worktree's crew lines. That is why the Global Crew Rates card stays out of the
 * suite.
 */
test.describe.serial("per-user crew rates", () => {
  test.setTimeout(180_000);

  test("admin sets a custom rate, then pins the user to the global Normal rate", async ({
    page,
  }) => {
    // A dedicated fixture rather than the suite's crew user: crew rates price
    // invoice crew lines, and `e2e-crew@` is assigned to events by other specs.
    runConvex("e2eHelpers:ensureCrewUser", {
      email: targetEmail,
      password: targetPassword,
      name: targetName,
    });
    const target = await waitForUserAdminState(targetEmail, (state) => Boolean(state?.userId));
    const globals = runConvex("e2eHelpers:getGlobalCrewRates", {}) as GlobalCrewRates;

    await page.goto("/dashboard/users/crew-rates");
    await expect(page.getByText("User Compensation Rates")).toBeVisible({ timeout: 30_000 });

    const row = page.getByTestId(`user-rate-row-${target.userId}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(targetEmail);

    const modeSelect = row.locator("[data-slot='select-trigger']");
    await pickSelectOption(page, modeSelect, "Custom");
    await formField(row, "Custom USD").fill("137");
    await saveRateRow(row);

    const custom = await waitForUserAdminState(targetEmail, (state) => state?.rateMode === "custom");
    expect(custom.storedHourlyRateUsd).toBe(137);
    expect(custom.effectiveHourlyRateUsd).toBe(137);
    // The row's own preview has to agree with what the server resolved.
    await expect(row).toContainText("Effective: $137/hr", { timeout: 30_000 });

    // Pinning to Normal drops the stored number entirely and defers to the
    // global rate — the whole point of the mode, and the thing that keeps a
    // pinned crew member in sync when the globals move.
    await pickSelectOption(page, modeSelect, `Normal ($${globals.normalRateUsd})`);
    await saveRateRow(row);

    const pinned = await waitForUserAdminState(targetEmail, (state) => state?.rateMode === "normal");
    expect(pinned.storedHourlyRateUsd).toBe(0);
    expect(pinned.effectiveHourlyRateUsd).toBe(globals.normalRateUsd);
    await expect(row).toContainText(`Effective: $${globals.normalRateUsd}/hr`, { timeout: 30_000 });

    // Reading the globals must not have changed them.
    const globalsAfter = runConvex("e2eHelpers:getGlobalCrewRates", {}) as GlobalCrewRates;
    expect(globalsAfter).toEqual(globals);
  });

  test("the Users table shows the same rate the rates page set", async ({ page }) => {
    // Two editors write `userCompensationRates`: this page and the Hourly Rate
    // field in the Users details panel. The table renders the *resolved* rate for a
    // pinned user ("synced") rather than a stored one, so a mode set here has to
    // be legible there.
    const target = await waitForUserAdminState(targetEmail, (state) => state?.rateMode === "normal");
    const globals = runConvex("e2eHelpers:getGlobalCrewRates", {}) as GlobalCrewRates;

    await page.goto("/dashboard/users/access");
    const row = page.getByTestId(`user-row-${target.userId}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await chooseRowAction(page, userRowActionMenu(row), "Show details");
    await expect(userRatePanel(page, target.userId)).toContainText(
      `$${globals.normalRateUsd}/hr (synced)`,
      { timeout: 30_000 },
    );
  });
});

/**
 * Save a rate row and wait for the form to settle.
 *
 * The Save button only exists while the row form is dirty, and `onSuccess` calls
 * `form.reset(values)` after the mutation resolves. Editing the row again before
 * that reset lands means the reset overwrites the new edit — the same trap the
 * invoice editor sets when it remounts on save.
 */
async function saveRateRow(row: Locator) {
  const save = row.getByRole("button", { name: "Save", exact: true });
  await save.click();
  await expect(save).toHaveCount(0, { timeout: 30_000 });
}
