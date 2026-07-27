import type { Locator, Page } from "@playwright/test";

/**
 * Locate the input of a `TextFormField` by the label rendered above it.
 *
 * `getByLabel` does not work on these. `FormLabel` sets `htmlFor={formItemId}`,
 * but `FormControl` is a plain wrapper `<div>` that takes that same id rather
 * than forwarding it to the control inside — so the label points at the div,
 * and no input is ever "labelled" as far as the accessibility tree (or
 * Playwright) is concerned. `e2e/helpers/auth.ts` works around the same thing by
 * addressing sign-in inputs positionally.
 *
 * Scoping to the `form-item` wrapper and taking the input inside it is the
 * closest stable equivalent, and it keeps specs readable as "the field under
 * this label".
 */
export function formFieldInput(page: Page, scope: Locator, label: string): Locator {
  return scope
    .locator("[data-slot='form-item']")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("input")
    .first();
}
