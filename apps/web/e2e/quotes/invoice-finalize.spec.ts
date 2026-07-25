import { test, expect } from "@playwright/test";
import { pollConvex } from "../helpers/convex";

test.describe("staff invoice create", () => {
  test("admin creates draft invoice and public quote link works", async ({ page }) => {
    const stamp = Date.now();
    const artistLabel = `E2E Artist ${stamp}`;

    await page.goto("/dashboard/financial-hub/invoices/new");
    await expect(page.getByText("Create Invoice").first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/E2E Admin/i).first()).toBeVisible({ timeout: 25_000 });

    await page.getByRole("button", { name: "Add artist row" }).click();
    await page.getByPlaceholder("Artist / role").fill(artistLabel);
    await page.getByPlaceholder("Qty").fill("1");
    await page.getByPlaceholder("Rate").fill("50");

    await expect(page.getByText("Unsaved changes")).toBeVisible({ timeout: 30_000 });
    const saveButton = page.getByRole("button", { name: "Save", exact: true });
    await expect(saveButton).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await saveButton.click();

    await page.waitForURL(/\/dashboard\/financial-hub\/invoices\/(?!new$)[^/?#]+/, {
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { name: "Edit Invoice" })).toBeVisible({
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
      (row) => Boolean(row?.publicApprovalToken) && Boolean(row.invoiceNumber),
    );
    expect(state.status).toBe("draft");
    expect(state.invoiceNumber).toMatch(/^ALINV-/);
    expect(state.publicPath).toBeTruthy();

    await page.goto(state.publicPath!);
    await expect(page.getByText(/Terms & Conditions/i).first()).toBeVisible({ timeout: 25_000 });
  });
});
