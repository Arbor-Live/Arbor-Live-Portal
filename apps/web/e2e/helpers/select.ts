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
 * Open a `SearchableSelect` (`@/components/inventory/searchable-select`),
 * search it, and pick a matching option.
 *
 * Generalised from `e2e/quotes/invoice-organizations.spec.ts`, where every part
 * of this was earned. `SearchableSelect` portals its menu to `document.body`
 * and pins it with `position: fixed` at `trigger.bottom + 4`, with no flip-up,
 * then recomputes that on every scroll event:
 *
 * 1. Center the trigger first. `scrollIntoViewIfNeeded` stops as soon as the
 *    trigger is barely visible — typically at the bottom edge — which lays the
 *    menu out past the fold. The menu is `fixed`, so nothing can scroll it back
 *    and the click fails "outside of the viewport".
 * 2. Click the option with `force`, because Playwright's own scroll-into-view
 *    fires the reposition listener, so the "stable" actionability check never
 *    settles and an ordinary click spins until the test times out.
 * 3. Confirm the pick landed. `force` skips the hit test, so a click that missed
 *    leaves the menu open — and an open menu keeps its scroll listener
 *    installed, which destabilises every later click on the page.
 *
 * The older `selectSearchableOption` in `e2e/helpers/auth.ts` does none of
 * this and only works on fields high enough on the page to dodge the problem.
 */
export async function pickSearchableOption(
  page: Page,
  trigger: Locator,
  query: string,
  optionName: string | RegExp,
) {
  await trigger.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await trigger.click();

  // The menu carries its own testid because it is portalled to `body` and these
  // pages already render several "Search …" inputs of their own — a
  // placeholder-based locator would just as happily match the filter bar behind
  // the menu. Its one input is likewise addressed structurally: the placeholder
  // is whatever the call site passed, and several read "Filter by …" rather
  // than "Search …".
  const menu = page.getByTestId("searchable-select-menu");
  await expect(menu).toBeVisible({ timeout: 25_000 });
  await menu.locator("input").first().fill(query);

  // Match inside the menu: the create affordance renders a `New …: "<query>"`
  // button that is the only hit until the options settle, so a loose name can
  // open the create modal instead of selecting anything.
  const option = menu.getByRole("button", { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 25_000 });
  await option.click({ force: true });

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
