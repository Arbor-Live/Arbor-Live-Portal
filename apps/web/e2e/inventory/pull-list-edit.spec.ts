import { test, expect, type Page } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

type PullListState = {
  lineCount: number;
  totalPieces: number;
  lines: Array<{ label: string; lineKind: string; quantityRequired: number }>;
};

/**
 * The Equipment tab remounts `EventPullList` (keyed on the persisted list)
 * when the Convex query settles, which resets the editor panel — so keep
 * clicking "Edit list" until the panel stays open.
 */
async function openPullListEditor(page: Page) {
  await expect(async () => {
    const openButton = page.getByRole("button", { name: "Edit list" });
    if (await openButton.isVisible()) await openButton.click();
    const hideButton = page.getByRole("button", { name: "Hide editor" });
    await expect(hideButton).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1_500);
    await expect(hideButton).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  await expect(page.getByText("Edit pull list")).toBeVisible({ timeout: 20_000 });
}

test.describe("pull list editor", () => {
  test("admin can change a line quantity and it survives a reload", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = runConvex("e2eHelpers:seedDryHireWithPullList", {
      title: `E2E Pull List ${Date.now()}`,
    }) as { eventId: string; typeName: string; equipmentPath: string };

    await page.goto(seeded.equipmentPath);
    await expect(page.getByRole("heading", { name: "What to pull" })).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.getByText(/1 line · 1 piece total/)).toBeVisible({ timeout: 25_000 });
    await openPullListEditor(page);

    const editorRow = page
      .locator("div.rounded-md.border.bg-background")
      .filter({ hasText: seeded.typeName })
      .first();
    await editorRow.locator("input").fill("4");

    // Both this form and the event overview can show a save bar at once; they
    // stack via FormSaveBarStackProvider, so a real click reaches this one.
    await page.getByRole("button", { name: "Save pull list" }).click();

    const saved = await pollConvex<PullListState>(
      "e2eHelpers:getPullListState",
      { eventId: seeded.eventId },
      (row) => row?.lines.some((line) => line.quantityRequired === 4) ?? false,
    );
    expect(saved.lineCount).toBe(1);
    expect(saved.totalPieces).toBe(4);

    await page.reload();
    await expect(page.getByRole("heading", { name: "What to pull" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/1 line · 4 pieces/)).toBeVisible({ timeout: 25_000 });
  });

  test("admin can add an inventory type line to the pull list", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = runConvex("e2eHelpers:seedDryHireWithPullList", {
      title: `E2E Pull List Add ${Date.now()}`,
    }) as { eventId: string; typeName: string; equipmentPath: string };

    await page.goto(seeded.equipmentPath);
    await expect(page.getByRole("heading", { name: "What to pull" })).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.getByText(/1 line · 1 piece total/)).toBeVisible({ timeout: 25_000 });
    await openPullListEditor(page);

    // Server-side search keeps the picker off the full inventory catalog.
    await page.getByTestId("searchable-select-trigger").first().click();
    const menu = page
      .locator("body > div")
      .filter({ has: page.getByPlaceholder(/Search/i) })
      .last();
    await menu.getByPlaceholder(/Search/i).fill(seeded.typeName);
    await page.getByRole("button", { name: seeded.typeName }).first().click();

    await page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Qty", { exact: true }) })
      .locator("input")
      .fill("2");

    await page.getByRole("button", { name: "Add", exact: true }).click();

    const saved = await pollConvex<PullListState>(
      "e2eHelpers:getPullListState",
      { eventId: seeded.eventId },
      (row) => (row?.lineCount ?? 0) >= 2,
    );
    expect(saved.lineCount).toBe(2);
    expect(saved.totalPieces).toBe(3);
    expect(saved.lines.map((line) => line.label)).toContain(seeded.typeName);
  });
});
