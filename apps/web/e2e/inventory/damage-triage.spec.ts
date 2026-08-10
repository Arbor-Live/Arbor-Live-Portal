import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

/**
 * Triage actions live in the report detail sheet (opened from a queue card),
 * not on the card itself — the card only summarises. The sheet is driven by the
 * `?report=` search param so the mention email can deep-link into it.
 */
test.describe("damage triage", () => {
  test("admin can move an open damage report to in progress then resolved", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedOpenDamageReport", {}) as {
      reportId: string;
      assetId: string;
      queuePath: string;
    };

    // Other specs leave open reports behind, so always act inside this
    // report's own card rather than on the first matching button.
    const card = () =>
      page.locator('[data-slot="card"]').filter({ hasText: seeded.assetId }).first();
    const sheet = () => page.getByTestId("damage-report-sheet");

    // The sheet is modal, so it must be dismissed before the filter buttons
    // underneath are clickable again.
    async function closeSheet() {
      await page.keyboard.press("Escape");
      await expect(sheet()).toBeHidden({ timeout: 15_000 });
    }

    await page.goto(seeded.queuePath);
    await expect(page.getByText("Damage & repair").first()).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: "open", exact: true }).click();
    await expect(card()).toBeVisible({ timeout: 20_000 });

    await card().click();
    await expect(sheet()).toBeVisible({ timeout: 20_000 });
    await sheet().getByRole("button", { name: "Mark in progress" }).click();

    await pollConvex(
      "e2eHelpers:getDamageReportState",
      { reportId: seeded.reportId },
      (row: { status: string } | null) => row?.status === "in_progress",
    );
    await closeSheet();

    await page.getByRole("button", { name: "in progress", exact: true }).click();
    await expect(card()).toBeVisible({ timeout: 20_000 });

    await card().click();
    await expect(sheet()).toBeVisible({ timeout: 20_000 });
    await sheet().getByRole("button", { name: "Resolve (repaired)" }).click();

    const resolved = await pollConvex<{ status: string; assetId: string }>(
      "e2eHelpers:getDamageReportState",
      { reportId: seeded.reportId },
      (row) => row?.status === "resolved",
    );
    expect(resolved.status).toBe("resolved");
    expect(resolved.assetId).toBe(seeded.assetId);
    await closeSheet();

    await page.getByRole("button", { name: "resolved", exact: true }).click();
    await expect(card()).toBeVisible({ timeout: 20_000 });
  });
});
