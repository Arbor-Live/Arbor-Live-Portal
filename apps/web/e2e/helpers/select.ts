import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Pick an option from a Radix `Select` (`@/components/ui/select`).
 *
 * These are not native `<select>` elements, so `selectOption` does not apply —
 * and clicking the option you want does not reliably work either.
 *
 * Radix portals the listbox to `document.body` and aligns it so the *checked*
 * item sits over the trigger. On a long list — the organization pickers grow
 * with every band org on the deployment — that puts most options outside the
 * browser viewport, where Playwright refuses to click them. It is not an
 * actionability wait that eventually succeeds: `force` does not help, because
 * out-of-viewport is a hard error, and scrolling does not help, because the menu
 * is positioned rather than scrolled. In Batch 9 this first appeared as a bare
 * three-minute test timeout with no failing assertion attached to it.
 *
 * So this drives the menu the way a keyboard user does: open it, use Radix's
 * built-in typeahead to highlight the option by its label, and press Enter. No
 * coordinates are involved, so the length of the list stops mattering.
 *
 * The Users table renders several selects per row, most of them showing only an
 * icon and a value, so pass a `data-testid`-scoped trigger rather than trying to
 * find one by its accessible name.
 */
export async function pickSelectOption(
  page: Page,
  trigger: Locator,
  optionLabel: string,
  options?: { expectTriggerText?: string | RegExp | false },
) {
  await expect(trigger).toBeVisible({ timeout: 25_000 });

  // Already showing what we want. Worth short-circuiting rather than opening and
  // re-picking: it is faster, and it keeps a spec from depending on a menu
  // interaction that has nothing to assert.
  const current = (await trigger.textContent())?.trim() ?? "";
  if (current === optionLabel) return;

  await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await trigger.click();

  // Open and closed are read off the trigger, not off a page-wide
  // `getByRole("listbox")`: these pages carry a listbox that is never ours, so a
  // global count never reaches zero and the helper hangs on a menu it already
  // closed.
  await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 15_000 });
  // Typeahead matches on the item's label prefix, so the full label is safe even
  // where one option's label is a prefix of another's.
  await page.keyboard.type(optionLabel, { delay: 20 });
  await page.keyboard.press("Enter");

  // Radix keeps the menu mounted through its close animation, and a later click
  // elsewhere on the page hits the dismiss overlay instead of its target if we
  // move on too early.
  await expect(trigger).toHaveAttribute("aria-expanded", "false", { timeout: 15_000 });

  // Typeahead that matched nothing still closes the menu on Enter, having
  // selected whatever was highlighted — so confirm the pick actually landed.
  const expected = options?.expectTriggerText;
  if (expected === false) return;
  await expect(trigger).toHaveText(expected ?? optionLabel, { timeout: 15_000 });
}

/**
 * Run an action that trips a native `window.confirm`, answering it a chosen way
 * and returning what it asked.
 *
 * Playwright dismisses dialogs by default, so a confirm-guarded mutation never
 * runs unless a handler is registered *before* the action — the spec then times
 * out polling for a change nobody requested. Both answers are worth driving:
 * accepting is the operator confirming, dismissing is the operator backing out,
 * and it is the dismiss case that catches a guard being deleted, since "nothing
 * happened" is also what an unguarded spec sees.
 *
 * The returned message is asserted on so the spec fails loudly if no dialog
 * appeared at all, rather than passing on a silently unguarded mutation.
 */
export async function withConfirm(
  page: Page,
  answer: "accept" | "dismiss",
  action: () => Promise<unknown>,
): Promise<string> {
  let message = "";
  page.once("dialog", (dialog) => {
    message = dialog.message();
    void (answer === "accept" ? dialog.accept() : dialog.dismiss());
  });
  await action();
  return message;
}

/** `withConfirm` for the common case: one click behind one confirm. */
export function clickWithConfirm(
  page: Page,
  target: Locator,
  answer: "accept" | "dismiss",
) {
  return withConfirm(page, answer, () => target.click());
}
