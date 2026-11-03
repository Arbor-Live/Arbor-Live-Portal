import type { Locator, Page } from "@playwright/test";

/**
 * Either root a field lookup can hang off. `Page` and `Locator` both expose
 * `.locator()`, and callers scope to whichever is narrower at the call site —
 * a card when one is in hand, the page when the field is unambiguous.
 */
type FieldScope = Locator | Page;

/**
 * The `<input>` of a `TextFormField`, found by the text of its form item.
 * `getByLabel` also works on `FormField` inputs; this helper predates that.
 */
export function formField(scope: FieldScope, label: string | RegExp) {
  return scope
    .locator("[data-slot='form-item']")
    .filter({ hasText: label })
    .locator("input");
}

/**
 * Same lookup as `formField`, for a `TextareaFormField`.
 *
 * Both take a `RegExp` as well as a string because `hasText` matches a
 * substring: on the package editor "Subsidized Package Price (USD)" also
 * matches the "Non-Subsidized Package Price (USD)" item, and the ambiguity only
 * surfaces as a strict-mode violation at the point of use.
 */
export function formTextarea(scope: FieldScope, label: string | RegExp) {
  return scope
    .locator("[data-slot='form-item']")
    .filter({ hasText: label })
    .locator("textarea");
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
