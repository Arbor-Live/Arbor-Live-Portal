import { expect, type Browser, type Page } from "@playwright/test";
import { pollConvex } from "./convex";
import { e2eEnv } from "./env";

/**
 * Shared drivers for the invoice editor.
 *
 * The editor autosaves unsent drafts on a 2.5s debounce *and* exposes an
 * explicit Save in the sticky bar (sent and approved quotes only save
 * explicitly). Specs drive the explicit path so the assertion point is
 * deterministic, but the debounce can still fire on its own — so assert
 * against persisted state via `pollConvex` rather than counting saves.
 */

export type InvoiceRevisionsState = {
  clientApprovalStatus: string;
  totalUsd: number;
  approvedTotalUsd: number | null;
  revisions: Array<{ number: number; kind: string; totalUsd: number; note: string | null; recordedLate: boolean }>;
};

type ApprovalEditorState = {
  clientApprovalStatus: string | null;
  publicApprovalToken: string | null;
  publicPath: string | null;
};

/**
 * The saved editor's title: the invoice number (`ALINV-…`). `/invoices/new`
 * shows "Create invoice" until the first save.
 */
export function invoiceEditorHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: /^ALINV-/ });
}

/** Add a line from the line-items card's Add menu, e.g. "Artist", "External rental", "Fee". */
export async function addInvoiceLine(page: Page, kind: string) {
  await page.getByTestId("invoice-add-line").click();
  await page.getByRole("menuitem", { name: kind, exact: true }).click();
}

/** Run an item from the header's `⋯` menu, located by its test id. */
export async function openInvoiceMenuItem(page: Page, testId: string) {
  await page.getByRole("button", { name: "More invoice actions" }).click();
  await page.getByTestId(testId).click();
}

/** Save the editor and wait for the sticky bar to settle. */
export async function saveInvoiceEditor(page: Page) {
  const saveButton = page.getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeVisible({ timeout: 30_000 });
  // Blur any open combobox first: a stray dropdown swallows the click.
  await page.keyboard.press("Escape");
  await saveButton.click();
}

/**
 * Create a draft invoice from `/invoices/new` with a single artist line and
 * return its id.
 *
 * Artist lines are used deliberately: `computeLineAmount` passes their rate
 * straight through, while equipment and crew lines resolve their rate from
 * catalog rows or the global `invoiceSettings` — shared state that other
 * worktrees can change underneath a running spec.
 */
export async function createDraftInvoiceWithArtistLine(
  page: Page,
  options: { label: string; quantity?: string; rate?: string },
): Promise<string> {
  await page.goto("/dashboard/financial-hub/invoices/new");
  await expect(page.getByText("Create invoice").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/E2E Admin/i).first()).toBeVisible({ timeout: 25_000 });

  await addInvoiceLine(page, "Artist");
  const row = page.getByTestId("invoice-row-artist-0");
  await row.getByPlaceholder("Artist / role").fill(options.label);
  await row.getByPlaceholder("People").fill(options.quantity ?? "1");
  await row.getByPlaceholder("Rate").fill(options.rate ?? "50");

  await expect(page.getByText("Unsaved changes")).toBeVisible({ timeout: 30_000 });
  await saveInvoiceEditor(page);
  await waitForInvoiceEditorUrl(page);
  const invoiceId = invoiceIdFromUrl(page);

  // Reload onto the canonical URL before handing the page back.
  //
  // Saving from `/invoices/new` does a `router.replace` into the `[id]` route,
  // which remounts the editor and re-hydrates every field from the saved
  // invoice. A spec that starts typing before that pass lands has its input
  // silently reverted — and the pass is not observable from the outgoing
  // component, so there is nothing on the pre-remount page to wait for. One
  // explicit load collapses that into a single hydration this helper can wait
  // out.
  await page.goto(`/dashboard/financial-hub/invoices/${invoiceId}`);
  await expect(invoiceEditorHeading(page)).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByTestId("invoice-row-artist-0").getByPlaceholder("Artist / role"),
  ).toHaveValue(options.label, { timeout: 30_000 });
  await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 30_000 });

  return invoiceId;
}

/**
 * Wait for `/invoices/new` to become `/invoices/{id}` after the first save.
 *
 * Deliberately polls `page.url()` rather than using `page.waitForURL`. The
 * editor gets there via `router.replace`, a client-side navigation that fires no
 * `load` event, so `waitForURL`'s default `waitUntil: "load"` can hang for the
 * full timeout even though the URL and the heading have already changed.
 */
export async function waitForInvoiceEditorUrl(page: Page) {
  await expect(invoiceEditorHeading(page)).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(() => page.url(), { timeout: 30_000 })
    .toMatch(/\/dashboard\/financial-hub\/invoices\/(?!new$)[^/?#]+/);

  // Wait for the post-save hydration pass to land before returning. Once the
  // saved invoice arrives over the Convex subscription the editor rewrites its
  // form state from it, so anything a spec types in that window is silently
  // reverted. A settled save bar is the observable end of that pass.
  await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 30_000 });
}

/** Extract the invoice id from the current editor URL. */
export function invoiceIdFromUrl(page: Page): string {
  return page.url().split("/").pop()!.split("?")[0]!;
}

/** Read one of the totals rows as a number, e.g. "Subtotal: $220.00" -> 220. */
export async function readTotal(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).innerText()).trim();
  const match = text.match(/-?\$?([\d,]+(?:\.\d+)?)/);
  if (!match) throw new Error(`Could not parse a number out of ${testId}: "${text}"`);
  return Number(match[1]!.replace(/,/g, ""));
}

/** A quote approved by the client (at $150) through its public page, open in the editor. */
export async function clientApprovedQuote(page: Page, browser: Browser, label: string) {
  const invoiceId = await createDraftInvoiceWithArtistLine(page, { label, quantity: "1", rate: "150" });
  const drafted = await pollConvex<ApprovalEditorState>(
    "e2eHelpers:getInvoiceEditorState",
    { invoiceId },
    (row) => Boolean(row?.publicApprovalToken),
  );

  const clientContext = await browser.newContext({ baseURL: e2eEnv.baseURL });
  try {
    const clientPage = await clientContext.newPage();
    await clientPage.goto(`${drafted.publicPath!}?tab=quote`);
    await expect(clientPage.getByText(/Terms & conditions/i).first()).toBeVisible({ timeout: 25_000 });
    await clientPage.getByPlaceholder("Jordan Lee").fill("E2E Approver");
    await clientPage.getByText("I will be submitting the payment").click();
    await clientPage.getByRole("button", { name: "Approve quote" }).click();
    await expect(clientPage.getByText(/Approved on/i).first()).toBeVisible({ timeout: 25_000 });
  } finally {
    await clientContext.close();
  }

  // Approval pins what the client agreed to.
  const approved = await pollConvex<InvoiceRevisionsState>(
    "e2eHelpers:getInvoiceRevisionsState",
    { invoiceId },
    (row) => row?.clientApprovalStatus === "approved" && row.revisions.length === 1,
  );
  expect(approved.revisions[0]).toMatchObject({ number: 1, kind: "approved", totalUsd: 150, recordedLate: false });
  expect(approved.approvedTotalUsd).toBe(150);

  await page.goto(`/dashboard/financial-hub/invoices/${invoiceId}`);
  await expect(invoiceEditorHeading(page)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("invoice-versions-card")).toContainText("Approved", { timeout: 25_000 });
  return { invoiceId, publicPath: drafted.publicPath! };
}
