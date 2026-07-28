import type { Locator } from "@playwright/test";

/**
 * The `<input>` of a `TextFormField`, found by its visible label.
 *
 * `getByLabel` does not work on these. `FormControl` renders a plain
 * `<div id={formItemId}>` around the input and `FormLabel` points `htmlFor` at
 * that div, so every label in the app is associated with a non-labelable
 * element and `getByLabel` resolves to nothing.
 *
 * That failure used to be invisible: with no `actionTimeout`, `fill()` on an
 * empty locator waited out the entire test timeout with no error and no browser
 * activity, reading as a slow app rather than a bad selector. The config now
 * caps actions at 45s so it fails legibly, but the locator still has to be
 * right — hence this helper.
 */
export function formField(scope: Locator, label: string) {
  return scope
    .locator("[data-slot='form-item']")
    .filter({ hasText: label })
    .locator("input");
}

/**
 * A Radix `Select` trigger found by the plain `<Label>` beside it.
 *
 * Same root cause as above, minus the input: these labels are bare `<Label>`
 * elements in a `div.space-y-1`, with no association to the trigger at all.
 *
 * The inner locator is built from `scope.page()`, not from `scope`. A locator
 * passed to `filter({ has })` keeps its own selector chain, so
 * `scope.getByText(...)` asks Playwright to find a `[data-testid=…]` *inside*
 * each candidate `div.space-y-1`, which never matches. Every working precedent
 * in this suite roots the inner locator at the page for the same reason.
 */
export function selectByLabel(scope: Locator, label: string) {
  return scope
    .locator("div.space-y-1")
    .filter({ has: scope.page().getByText(label, { exact: true }) })
    .locator("[data-slot='select-trigger']");
}

/**
 * A checkbox in a `MembershipCheckboxes` grid (verticals / disciplines).
 *
 * These *are* wrapped in a real `<label>`, but matching on the label's own text
 * rather than by association keeps every field lookup in this suite consistent.
 */
export function checkboxByLabel(scope: Locator, label: string) {
  return scope
    .locator("label")
    .filter({ hasText: label })
    .locator("input[type='checkbox']");
}
