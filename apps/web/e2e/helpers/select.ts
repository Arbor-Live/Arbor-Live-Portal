import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Pick an option from a Radix `Select` (`@/components/ui/select`).
 *
 * Unlike the app's `SearchableSelect`, Radix portals its listbox *and* locks
 * page scroll while open, so this needs none of the centering/`force` dance in
 * `e2e/quotes/invoice-organizations.spec.ts`. What it does need is the closing
 * assertion: the listbox unmounts on an animation, and clicking a second
 * trigger while the first is still mounted lands on Radix's dismiss layer
 * instead of the trigger, so the next pick silently targets the wrong select.
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
