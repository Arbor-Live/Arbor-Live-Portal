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
    // report's own row rather than on the first matching button.
    const card = () => page.getByTestId("damage-report-row").filter({ hasText: seeded.assetId }).first();
    const sheet = () => page.getByTestId("damage-report-sheet");

    // The sheet is modal, so it must be dismissed before the filter chips
    // underneath are clickable again.
    async function closeSheet() {
      await page.keyboard.press("Escape");
      await expect(sheet()).toBeHidden({ timeout: 15_000 });
    }

    await page.goto(seeded.queuePath);
    await expect(page.getByText("Damage & repair").first()).toBeVisible({ timeout: 25_000 });
    // The queue opens on Open + In progress.
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

    await expect(card()).toContainText("In progress", { timeout: 20_000 });

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

    // Resolved reports leave the default queue; add Resolved to the Status chip.
    await expect(card()).toBeHidden({ timeout: 20_000 });
    await page.getByTestId("filter-chip-status").getByRole("button").first().click();
    await page.getByTestId("filter-menu-status").getByLabel("Resolved").check();
    await page.keyboard.press("Escape");
    await expect(card()).toBeVisible({ timeout: 20_000 });
  });
});
