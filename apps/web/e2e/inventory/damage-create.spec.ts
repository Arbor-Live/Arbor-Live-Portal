import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

type DamageReport = {
  reportId: string;
  status: string;
  assetId: string;
  severity: number | null;
  operability: string | null;
  notes: string | null;
};

test.describe("damage report create", () => {
  test("admin can file a damage report from the queue and see it in Open", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = runConvex("e2eHelpers:seedDryHireWithPullList", {
      title: `E2E Damage Create ${Date.now()}`,
    }) as { assetId: string };
    const notes = `E2E damage note ${Date.now()}`;

    await page.goto("/dashboard/inventory/damage");
    await expect(page.getByText("Damage & repair").first()).toBeVisible({ timeout: 25_000 });

    await page.getByRole("button", { name: "Report damage" }).click();
    await expect(page.getByRole("heading", { name: "Report damage" })).toBeVisible({
      timeout: 15_000,
    });

    // Typed asset tag stands in for a QR scan (no camera in CI).
    const scanInput = page.locator("#asset-scan-input");
    await scanInput.fill(seeded.assetId);
    await scanInput.press("Enter");
    await expect(page.getByText(/Asset selected/i)).toBeVisible({ timeout: 25_000 });

    await page.getByLabel("Damage severity (1–5)").fill("4");
    await page.getByLabel("Notes").fill(notes);
    // Photo and related event stay optional — "I don't know when it happened"
    // is already checked because the queue opens the wizard without an event.

    await page.getByRole("button", { name: "Submit damage report" }).click();

    const report = await pollConvex<DamageReport>(
      "e2eHelpers:getLatestDamageReportByAssetId",
      { assetId: seeded.assetId },
      (row) => row?.status === "open",
    );
    expect(report.severity).toBe(4);
    expect(report.operability).toBe("needs_repair");
    expect(report.notes).toBe(notes);

    await page.getByRole("button", { name: "open", exact: true }).click();
    await expect(page.getByText(seeded.assetId).first()).toBeVisible({ timeout: 25_000 });
  });
});
