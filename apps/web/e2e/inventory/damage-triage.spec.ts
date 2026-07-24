import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("damage triage", () => {
  test("admin can move an open damage report to in progress then resolved", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedOpenDamageReport", {}) as {
      reportId: string;
      assetId: string;
      queuePath: string;
    };

    await page.goto(seeded.queuePath);
    await expect(page.getByText("Damage & repair").first()).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: "open", exact: true }).click();
    await expect(page.getByText(seeded.assetId).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Mark in progress" }).click();

    await pollConvex(
      "e2eHelpers:getDamageReportState",
      { reportId: seeded.reportId },
      (row: { status: string } | null) => row?.status === "in_progress",
    );

    await page.getByRole("button", { name: "in progress", exact: true }).click();
    await expect(page.getByText(seeded.assetId).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Resolve (repaired)" }).click();

    const resolved = await pollConvex<{ status: string; assetId: string }>(
      "e2eHelpers:getDamageReportState",
      { reportId: seeded.reportId },
      (row) => row?.status === "resolved",
    );
    expect(resolved.status).toBe("resolved");
    expect(resolved.assetId).toBe(seeded.assetId);

    await page.getByRole("button", { name: "resolved", exact: true }).click();
    await expect(page.getByText(seeded.assetId).first()).toBeVisible({ timeout: 20_000 });
  });
});
