import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";
import { pickSearchableOption } from "../helpers/select";
import {
  invoiceIdFromUrl,
  readTotal,
  saveInvoiceEditor,
  waitForInvoiceEditorUrl,
} from "../helpers/invoice";

type FeeDefinitionState = {
  id: string;
  key: string;
  label: string;
  defaultAmountUsd: number | null;
  active: boolean;
};

type TotalsState = {
  feesSubtotalUsd: number;
  subtotalUsd: number;
  lineItems: Array<{
    section: string;
    label: string;
    quantity: number;
    rateUsd: number;
    amountUsd: number;
    feeDefinitionId: string | null;
  }>;
};

/**
 * Fee definitions (`/dashboard/financial-hub` "Fee Definitions" card).
 *
 * The card is the source of the invoice editor's fee picker: a definition's
 * `defaultAmountUsd` pre-fills the rate when a fee row selects it, and the
 * persisted line carries `feeDefinitionId` so the totals Batch 8 asserts
 * downstream are traceable to their definition. The spec drives the card for
 * CRUD, then the editor to prove the link end to end.
 *
 * Cleanup deletes the definitions and the integration draft invoice through
 * `ctx.db`, so a failed run cannot leave picker clutter on the shared
 * deployment.
 */
test.describe("invoice fee definitions", () => {
  const crudKey = `e2e_fee_${Date.now()}`;
  const crudLabel = `E2E Fee ${Date.now()}`;
  const integrationKey = `e2e_fee_int_${Date.now()}`;
  const integrationLabel = `E2E Fee Int ${Date.now()}`;
  const createdInvoices: string[] = [];

  test.afterAll(() => {
    runConvex("e2eHelpers:deleteInvoiceSettingsFixtures", {
      feeKeys: [crudKey, integrationKey],
      termLabels: [],
      invoiceIds: createdInvoices,
    });
  });

  test("admin adds, edits, disables, and deletes a fee definition", async ({ page }) => {
    await page.goto("/dashboard/financial-hub");
    await expect(page.getByText("Fee Definitions").first()).toBeVisible({ timeout: 25_000 });

    // Add via the card's form.
    await page.getByPlaceholder("Key (e.g. labor_fee)").fill(crudKey);
    await page.getByPlaceholder("Label").fill(crudLabel);
    await page.getByPlaceholder("Default amount").fill("60");
    await page.getByRole("button", { name: "Add Fee" }).click();

    const created = await pollConvex<FeeDefinitionState>(
      "e2eHelpers:getInvoiceFeeDefinitionByKey",
      { key: crudKey },
      (row) => row?.active === true,
    );
    expect(created.label).toBe(crudLabel);
    expect(created.defaultAmountUsd).toBe(60);

    // Edit the default amount in the row.
    const row = page
      .locator("div.rounded-md.border.p-3.text-sm")
      .filter({ hasText: crudLabel });
    await expect(row).toBeVisible({ timeout: 25_000 });
    await row.locator("input[type='number']").fill("90");
    await expect(row.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "Save" }).click();

    await pollConvex<FeeDefinitionState>(
      "e2eHelpers:getInvoiceFeeDefinitionByKey",
      { key: crudKey },
      (state) => state?.defaultAmountUsd === 90,
    );
    // The row form resets after a successful save — wait for Save to disappear
    // before touching the row again (trap 7).
    await expect(row.getByRole("button", { name: "Save" })).toHaveCount(0, {
      timeout: 20_000,
    });

    // Disable, then re-enable.
    await row.getByRole("button", { name: "Disable" }).click();
    await pollConvex<FeeDefinitionState>(
      "e2eHelpers:getInvoiceFeeDefinitionByKey",
      { key: crudKey },
      (state) => state?.active === false,
    );
    await expect(row.getByRole("button", { name: "Enable" })).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "Enable" }).click();
    await pollConvex<FeeDefinitionState>(
      "e2eHelpers:getInvoiceFeeDefinitionByKey",
      { key: crudKey },
      (state) => state?.active === true,
    );

    // Delete.
    await row.getByRole("button", { name: "Delete" }).click();
    await pollConvex<FeeDefinitionState | null>(
      "e2eHelpers:getInvoiceFeeDefinitionByKey",
      { key: crudKey },
      (state) => state === null,
    );
    await expect(page.getByText(crudLabel)).toHaveCount(0, { timeout: 20_000 });
  });

  test("a fee definition pre-fills the editor fee row and feeds the totals", async ({ page }) => {
    test.setTimeout(180_000);
    const rate = 75;

    // Create the definition through the settings card, then drive the editor.
    await page.goto("/dashboard/financial-hub");
    await expect(page.getByText("Fee Definitions").first()).toBeVisible({ timeout: 25_000 });
    await page.getByPlaceholder("Key (e.g. labor_fee)").fill(integrationKey);
    await page.getByPlaceholder("Label").fill(integrationLabel);
    await page.getByPlaceholder("Default amount").fill(String(rate));
    await page.getByRole("button", { name: "Add Fee" }).click();

    const seeded = await pollConvex<FeeDefinitionState>(
      "e2eHelpers:getInvoiceFeeDefinitionByKey",
      { key: integrationKey },
      (row) => row?.active === true,
    );

    await page.goto("/dashboard/financial-hub/invoices/new");
    await expect(page.getByText("Create Invoice").first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/E2E Admin/i).first()).toBeVisible({ timeout: 25_000 });

    await page.getByRole("button", { name: "Add fee" }).click();
    const feeRow = page.getByTestId("invoice-row-fee-0");
    await pickSearchableOption(
      page,
      feeRow.getByTestId("searchable-select-trigger"),
      integrationLabel,
      new RegExp(`^${integrationLabel}$`),
    );

    // Selecting the definition pre-fills the label and the rate from its
    // default amount; the totals panel picks it up.
    await expect(feeRow.getByPlaceholder("Label")).toHaveValue(integrationLabel, {
      timeout: 15_000,
    });
    await expect(feeRow.getByPlaceholder("Rate")).toHaveValue(String(rate), {
      timeout: 15_000,
    });
    await expect
      .poll(() => readTotal(page, "invoice-total-fees"), { timeout: 15_000 })
      .toBe(rate);

    await saveInvoiceEditor(page);
    await waitForInvoiceEditorUrl(page);
    const invoiceId = invoiceIdFromUrl(page);
    createdInvoices.push(invoiceId);

    // The persisted line carries the definition id and the server's independent
    // recomputation agrees with the browser's panel.
    const saved = await pollConvex<TotalsState>(
      "e2eHelpers:getInvoiceTotalsState",
      { invoiceId },
      (row) => (row?.lineItems ?? []).some((line) => line.section === "fee"),
    );
    expect(saved.feesSubtotalUsd).toBe(rate);
    expect(saved.subtotalUsd).toBe(rate);
    const feeLine = saved.lineItems.find((line) => line.section === "fee");
    expect(feeLine?.label).toBe(integrationLabel);
    expect(feeLine?.rateUsd).toBe(rate);
    expect(feeLine?.feeDefinitionId).toBe(seeded.id);
  });
});
