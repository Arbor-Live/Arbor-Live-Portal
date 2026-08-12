import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";
import { formField, formTextarea } from "../helpers/form";
import {
  invoiceIdFromUrl,
  saveInvoiceEditor,
  waitForInvoiceEditorUrl,
} from "../helpers/invoice";

type TermsTemplateState = {
  id: string;
  label: string;
  version: string;
  markdown: string;
  active: boolean;
};

type TermsInvoiceState = {
  termsIds: string[];
  additionalTermsMarkdown: string | null;
};

type ReviewState = {
  publicApprovalToken: string | null;
};

/**
 * Terms templates (`/dashboard/financial-hub` "Terms Templates" card).
 *
 * The card is the source of the invoice editor's Terms checkboxes and, through
 * `loadInvoiceTerms`, of the terms block on the public quote page. The spec
 * drives the card for CRUD, then attaches a template to a draft invoice and
 * asserts both the persisted `termsIds` and the rendered public page — the two
 * downstream consumers of the small module.
 *
 * Cleanup deletes the template and the integration draft invoice through
 * `ctx.db`, so a failed run cannot leave picker clutter on the shared
 * deployment.
 */
test.describe("invoice terms templates", () => {
  const crudLabel = `E2E Terms ${Date.now()}`;
  const integrationLabel = `E2E Terms Int ${Date.now()}`;
  const createdInvoices: string[] = [];

  test.afterAll(() => {
    runConvex("e2eHelpers:deleteInvoiceSettingsFixtures", {
      feeKeys: [],
      termLabels: [crudLabel, integrationLabel],
      invoiceIds: createdInvoices,
    });
  });

  test("admin adds, edits, disables, and deletes a terms template", async ({ page }) => {
    await page.goto("/dashboard/financial-hub");
    await expect(page.getByText("Terms Templates").first()).toBeVisible({ timeout: 25_000 });

    // Add via the card's form. These fields have real labels, so the form
    // helpers locate them (the fee card's same-named fields are placeholders).
    await formField(page, "Label").fill(crudLabel);
    await formField(page, "Version").fill("v1");
    await formTextarea(page, "Markdown").fill("Payment due within 30 days.");
    await page.getByRole("button", { name: "Add Terms" }).click();

    const created = await pollConvex<TermsTemplateState>(
      "e2eHelpers:getInvoiceTermsTemplateByLabel",
      { label: crudLabel },
      (row) => row?.active === true,
    );
    expect(created.version).toBe("v1");
    expect(created.markdown).toContain("30 days");

    // Edit the markdown in the row.
    const row = page
      .locator("div.rounded-md.border.p-3.text-sm")
      .filter({ hasText: `${crudLabel} (v1)` });
    await expect(row).toBeVisible({ timeout: 25_000 });
    await row.locator("textarea").fill("Payment due within 14 days.");
    await expect(row.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "Save" }).click();

    await pollConvex<TermsTemplateState>(
      "e2eHelpers:getInvoiceTermsTemplateByLabel",
      { label: crudLabel },
      (state) => state?.markdown.includes("14 days") === true,
    );
    // The row form resets after a successful save — wait for Save to disappear
    // before touching the row again (trap 7).
    await expect(row.getByRole("button", { name: "Save" })).toHaveCount(0, {
      timeout: 20_000,
    });

    // Disable, then re-enable.
    await row.getByRole("button", { name: "Disable" }).click();
    await pollConvex<TermsTemplateState>(
      "e2eHelpers:getInvoiceTermsTemplateByLabel",
      { label: crudLabel },
      (state) => state?.active === false,
    );
    await expect(row.getByRole("button", { name: "Enable" })).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "Enable" }).click();
    await pollConvex<TermsTemplateState>(
      "e2eHelpers:getInvoiceTermsTemplateByLabel",
      { label: crudLabel },
      (state) => state?.active === true,
    );

    // Delete.
    await row.getByRole("button", { name: "Delete" }).click();
    await pollConvex<TermsTemplateState | null>(
      "e2eHelpers:getInvoiceTermsTemplateByLabel",
      { label: crudLabel },
      (state) => state === null,
    );
    await expect(page.getByText(crudLabel)).toHaveCount(0, { timeout: 20_000 });
  });

  test("a terms template attaches to an invoice and renders on the public quote", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const markdown = "Payment terms: net 14 days from invoice date.";

    // Create the template through the settings card, then drive the editor.
    await page.goto("/dashboard/financial-hub");
    await expect(page.getByText("Terms Templates").first()).toBeVisible({ timeout: 25_000 });
    await formField(page, "Label").fill(integrationLabel);
    await formField(page, "Version").fill("v2");
    await formTextarea(page, "Markdown").fill(markdown);
    await page.getByRole("button", { name: "Add Terms" }).click();

    const seeded = await pollConvex<TermsTemplateState>(
      "e2eHelpers:getInvoiceTermsTemplateByLabel",
      { label: integrationLabel },
      (row) => row?.active === true,
    );

    await page.goto("/dashboard/financial-hub/invoices/new");
    await expect(page.getByText("Create Invoice").first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/E2E Admin/i).first()).toBeVisible({ timeout: 25_000 });

    // The Terms card only loads its catalog after a hover/focus, and only shows
    // active templates. Hover it so the checkbox for our template appears.
    await page.getByText("Terms", { exact: true }).first().hover();
    const termsCheckbox = page
      .locator("label")
      .filter({ hasText: `${integrationLabel} (v2)` })
      .locator("input[type='checkbox']");
    await expect(termsCheckbox).toBeVisible({ timeout: 25_000 });
    await termsCheckbox.check();

    // A line item is required to save.
    await page.getByRole("button", { name: "Add artist row" }).click();
    const artistRow = page.getByTestId("invoice-row-artist-0");
    await artistRow.getByPlaceholder("Artist / role").fill(`E2E Terms Artist ${Date.now()}`);
    await artistRow.getByPlaceholder("People").fill("1");
    await artistRow.getByPlaceholder("Rate").fill("100");

    await saveInvoiceEditor(page);
    await waitForInvoiceEditorUrl(page);
    const invoiceId = invoiceIdFromUrl(page);
    createdInvoices.push(invoiceId);

    // The invoice now references the template.
    const termsState = await pollConvex<TermsInvoiceState>(
      "e2eHelpers:getInvoiceTermsState",
      { invoiceId },
      (row) => (row?.termsIds ?? []).includes(seeded.id),
    );
    expect(termsState.termsIds).toContain(seeded.id);

    // And the public quote page renders its markdown.
    const review = await pollConvex<ReviewState>(
      "e2eHelpers:getInvoiceReviewState",
      { invoiceId },
      (row) => Boolean(row?.publicApprovalToken),
    );
    await page.goto(`/event/${review.publicApprovalToken}`);
    await expect(page.getByText(markdown).first()).toBeVisible({ timeout: 25_000 });
  });
});
