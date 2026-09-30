import { expect, type Page } from "@playwright/test";

/**
 * Helpers for the shared `FilterBar` (`components/filter-bar.tsx`): the search
 * box, the "Filter" menu that adds chips, and each chip's popover.
 */

/**
 * Add a filter chip through the shared `FilterBar`: open "Filter", pick the
 * filter, optionally switch to "is not", tick each option, then close the chip.
 */
export async function addFilter(
  page: Page,
  filter: string,
  /** Exact option labels, or a pattern for labels with extra text ("Name / Model"). */
  options: (string | RegExp)[],
  operator: "is" | "is not" = "is",
) {
  await page.getByTestId("filter-bar").getByRole("button", { name: /^Filter/ }).click();
  await page.getByRole("menuitem", { name: filter, exact: true }).click();
  const menu = page.locator("[data-testid^='filter-menu-']");
  await expect(menu).toBeVisible({ timeout: 20_000 });
  if (operator === "is not") await menu.getByRole("radio", { name: "is not" }).click();
  for (const option of options) {
    const search = menu.getByRole("textbox");
    if (typeof option === "string" && (await search.count())) await search.fill(option);
    // `click`, not `check`: a single-value chip closes as soon as it's picked.
    await menu
      .getByRole("checkbox", typeof option === "string" ? { name: option, exact: true } : { name: option })
      .click();
  }
  if (await menu.count()) await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0, { timeout: 20_000 });
}

/**
 * Change an existing chip: switch its operator and tick or untick options.
 * `toggle` lists option labels to click (ticked ones untick).
 */
export async function editFilter(
  page: Page,
  id: string,
  change: { operator?: "is" | "is not"; toggle?: string[] },
) {
  await page.getByTestId(`filter-chip-${id}`).getByRole("button").first().click();
  const menu = page.getByTestId(`filter-menu-${id}`);
  await expect(menu).toBeVisible({ timeout: 20_000 });
  if (change.operator) await menu.getByRole("radio", { name: change.operator, exact: true }).click();
  for (const option of change.toggle ?? []) {
    await menu.getByRole("checkbox", { name: option, exact: true }).click();
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0, { timeout: 20_000 });
}
