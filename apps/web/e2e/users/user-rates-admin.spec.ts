import { test, expect, type Locator, type Page } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { addFilter } from "../helpers/filter-bar";
import { openUserSheet, personRatePanel, waitForUserAdminState } from "../helpers/users";

const targetEmail = "e2e-rates-target@arborlive.test";
const targetPassword = "E2eTestPassword1!";
const targetName = "E2E Rates Target";

type GlobalCrewRates = { normalRateUsd: number; leadRateUsd: number };

/** Mirrors `formatHourly` in `lib/crew-rate-modes.ts`. */
function hourly(rate: number) {
  return `$${Number.isInteger(rate) ? rate.toLocaleString("en-US") : rate.toFixed(2)}/h`;
}

async function openRatesPage(page: Page, query = "") {
  await page.goto(`/dashboard/users/crew-rates${query}`);
  await expect(page.getByTestId("crew-rates-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("crew-rates-summary")).toBeVisible({ timeout: 30_000 });
}

/** Open a person's rate panel from their row. */
async function openRateSheet(page: Page, row: Locator) {
  await row.getByRole("button", { name: new RegExp(`^${targetName}`) }).click();
  const sheet = page.getByTestId("crew-rate-sheet");
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  return sheet;
}

/** Save the panel; it closes only once the mutation succeeds. */
async function saveRate(page: Page, sheet: Locator) {
  await sheet.getByRole("button", { name: "Save rate" }).click();
  await expect(page.getByTestId("crew-rate-sheet")).toHaveCount(0, { timeout: 30_000 });
}

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
 * worktree's crew lines. The Edit global rates dialog is opened and cancelled,
 * never saved.
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
    // Save only enables on a change, so pick a rate the fixture doesn't already have
    // (it persists between runs on a reused backend).
    const customRate = target.rateMode === "custom" && target.storedHourlyRateUsd === 137 ? 138 : 137;
    const globals = runConvex("e2eHelpers:getGlobalCrewRates", {}) as GlobalCrewRates;

    await openRatesPage(page);
    // The globals show in the header meta.
    await expect(page.getByTestId("crew-rates-global-normal")).toHaveText(`Normal ${hourly(globals.normalRateUsd)}`);
    await expect(page.getByTestId("crew-rates-global-lead")).toHaveText(`Lead ${hourly(globals.leadRateUsd)}`);

    await page.getByRole("textbox", { name: "Search people" }).fill(targetEmail);
    const row = page.getByTestId(`crew-rate-row-${target.userId}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(targetEmail);

    let sheet = await openRateSheet(page, row);
    await sheet.getByRole("radio", { name: "Custom" }).click();
    await sheet.getByLabel("Custom hourly rate (USD)").fill(String(customRate));
    await expect(sheet.getByTestId("crew-rate-preview")).toContainText(hourly(customRate));
    await saveRate(page, sheet);

    const custom = await waitForUserAdminState(
      targetEmail,
      (state) => state?.rateMode === "custom" && state.storedHourlyRateUsd === customRate,
    );
    expect(custom.storedHourlyRateUsd).toBe(customRate);
    expect(custom.effectiveHourlyRateUsd).toBe(customRate);
    // The row has to agree with what the server resolved.
    await expect(row).toContainText("Custom", { timeout: 30_000 });
    await expect(row).toContainText(hourly(customRate), { timeout: 30_000 });

    // Pinning to Normal drops the stored number entirely and defers to the
    // global rate — the whole point of the mode, and the thing that keeps a
    // pinned crew member in sync when the globals move.
    sheet = await openRateSheet(page, row);
    await sheet.getByRole("radio", { name: /^Normal/ }).click();
    // The custom field only exists for Custom.
    await expect(sheet.getByLabel("Custom hourly rate (USD)")).toHaveCount(0);
    await saveRate(page, sheet);

    const pinned = await waitForUserAdminState(targetEmail, (state) => state?.rateMode === "normal");
    expect(pinned.storedHourlyRateUsd).toBe(0);
    expect(pinned.effectiveHourlyRateUsd).toBe(globals.normalRateUsd);
    await expect(row).toContainText(hourly(globals.normalRateUsd), { timeout: 30_000 });

    // The Mode filter finds them under Normal and drops them under "is not".
    await addFilter(page, "Mode", ["Normal"]);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("filter-chips").getByRole("button", { name: "Clear all" }).click();
    await addFilter(page, "Mode", ["Normal"], "is not");
    await expect(row).toHaveCount(0, { timeout: 20_000 });

    // Reading the globals must not have changed them.
    const globalsAfter = runConvex("e2eHelpers:getGlobalCrewRates", {}) as GlobalCrewRates;
    expect(globalsAfter).toEqual(globals);
  });

  test("a deep link opens the panel, and the global rates dialog cancels without saving", async ({ page }) => {
    const target = await waitForUserAdminState(targetEmail, (state) => state?.rateMode === "normal");
    const globals = runConvex("e2eHelpers:getGlobalCrewRates", {}) as GlobalCrewRates;

    await openRatesPage(page, `?person=${encodeURIComponent(target.userId)}`);
    const sheet = page.getByTestId("crew-rate-sheet");
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await expect(sheet).toContainText(targetName);
    // Nothing changed yet, so there's nothing to save.
    await expect(sheet.getByRole("button", { name: "Save rate" })).toBeDisabled();
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toHaveCount(0, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/person=/);

    await page.getByRole("button", { name: "Edit global rates" }).click();
    const dialog = page.getByTestId("crew-rates-global-dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByLabel("Normal rate (USD/h)")).toHaveValue(String(globals.normalRateUsd));
    await expect(dialog.getByLabel("Lead rate (USD/h)")).toHaveValue(String(globals.leadRateUsd));
    await dialog.getByLabel("Normal rate (USD/h)").fill(String(globals.normalRateUsd + 1));
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 20_000 });

    const globalsAfter = runConvex("e2eHelpers:getGlobalCrewRates", {}) as GlobalCrewRates;
    expect(globalsAfter).toEqual(globals);
  });

  test("the person panel shows the same rate the rates page set", async ({ page }) => {
    // Two editors write `userCompensationRates`: this page and the Hourly rate
    // field in the person panel. The panel renders the *resolved* rate for a
    // pinned user ("synced") rather than a stored one, so a mode set here has to
    // be legible there.
    const target = await waitForUserAdminState(targetEmail, (state) => state?.rateMode === "normal");
    const globals = runConvex("e2eHelpers:getGlobalCrewRates", {}) as GlobalCrewRates;

    const { sheet } = await openUserSheet(page, target.userId);
    await expect(personRatePanel(sheet)).toContainText(
      `$${globals.normalRateUsd}/hr (synced)`,
      { timeout: 30_000 },
    );
  });
});
