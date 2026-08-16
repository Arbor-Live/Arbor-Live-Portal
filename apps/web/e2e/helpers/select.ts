import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Pick an option from a Radix `Select` (`@/components/ui/select`).
 *
 * Radix portals its listbox and locks page scroll while open. Wait for the
 * listbox to unmount before opening another select, or the next click can land
 * on the dismiss layer.
 */
export async function pickSelectOption(page: Page, trigger: Locator, optionName: string) {
  await trigger.click();
  const option = page.getByRole("option", { name: optionName, exact: true });
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await expect(page.getByRole("option", { name: optionName, exact: true })).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(trigger).toHaveText(optionName, { timeout: 20_000 });
}

/**
 * Open a `SearchableSelect` (`@/components/inventory/searchable-select`),
 * search it, and pick a matching option from the combobox list.
 */
export async function pickSearchableOption(
  page: Page,
  trigger: Locator,
  query: string,
  optionName: string | RegExp,
) {
  await trigger.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await trigger.click();

  const menu = page.getByTestId("searchable-select-menu");
  await expect(menu).toBeVisible({ timeout: 25_000 });
  await menu.locator("input").first().fill(query);

  const option = menu.getByRole("option", { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 25_000 });
  await option.scrollIntoViewIfNeeded();
  // Combobox options inside a sheet can be visible but not hittable (overlay /
  // stacking). autoHighlight + Enter matches how the control is meant to be used.
  await menu.locator("input").first().press("Enter");

  await expect(trigger).toHaveText(optionName, { timeout: 25_000 });
  await expect(menu).toHaveCount(0, { timeout: 25_000 });
}

/**
 * The Users table's per-row "Select..." action menu.
 *
 * It is a Radix `Select` used as a menu: `value` is pinned to `""` so the
 * trigger keeps showing its placeholder and every pick re-fires `onValueChange`.
 * That means the trigger text never changes, so the usual confirmation would
 * always fail — wait for the listbox to unmount instead.
 */
export async function chooseRowAction(page: Page, trigger: Locator, actionName: string) {
  await trigger.click();
  const option = page.getByRole("option", { name: actionName, exact: true });
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await expect(page.getByRole("option", { name: actionName, exact: true })).toHaveCount(0, {
    timeout: 20_000,
  });
}
