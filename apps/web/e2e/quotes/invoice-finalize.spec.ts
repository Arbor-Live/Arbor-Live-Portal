import { test, expect } from "@playwright/test";
import { pollConvex } from "../helpers/convex";
import { addInvoiceLine, invoiceEditorHeading } from "../helpers/invoice";

test.describe("staff invoice create", () => {
  test("admin creates draft invoice and public quote link works", async ({ page }) => {
    const stamp = Date.now();
    const artistLabel = `E2E Artist ${stamp}`;

    await page.goto("/dashboard/ops-center/invoices/new");
    await expect(page.getByText("Create invoice").first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/E2E Admin/i).first()).toBeVisible({ timeout: 25_000 });

    await addInvoiceLine(page, "Artist");
    await page.getByPlaceholder("Artist / role").fill(artistLabel);
    await page.getByPlaceholder("People").fill("1");
    await page.getByPlaceholder("Rate").fill("50");

    await expect(page.getByText("Unsaved changes")).toBeVisible({ timeout: 30_000 });
    const saveButton = page.getByRole("button", { name: "Save", exact: true });
    await expect(saveButton).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await saveButton.click();

    await page.waitForURL(/\/dashboard\/ops-center\/invoices\/(?!new$)[^/?#]+/, {
      timeout: 60_000,
    });
    await expect(invoiceEditorHeading(page)).toBeVisible({
      timeout: 25_000,
    });

    const invoiceId = page.url().split("/").pop()!.split("?")[0]!;
    const state = await pollConvex<{
      invoiceId: string;
      invoiceNumber: string;
      status: string;
      publicApprovalToken: string | null;
      publicPath: string | null;
    }>(
      "e2eHelpers:getInvoiceEditorState",
      { invoiceId },
      (row) => Boolean(row?.publicApprovalToken) && Boolean(row?.invoiceNumber),
    );
    expect(state.status).toBe("draft");
    expect(state.invoiceNumber).toMatch(/^ALINV-/);
    expect(state.publicPath).toBeTruthy();

    await page.goto(`${state.publicPath!}?tab=quote`);
    await expect(page.getByText(/Terms & conditions/i).first()).toBeVisible({ timeout: 25_000 });
  });
});
