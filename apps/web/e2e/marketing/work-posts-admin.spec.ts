import { test, expect, type Page } from "@playwright/test";
import { newestLabel, purgeBulk, seedBulk, bulkStamp } from "../helpers/bulk-seed";

/**
 * `marketingPosts.listAdmin` took 500 rows in index order and shipped every
 * post body to the list. It now reads a recency index and omits `contentJson`,
 * so the editor loads the selected post through `getById` — this covers both
 * the cap and that on-demand body fetch.
 */
const POST_COUNT = 250;

/** FormLabel's `htmlFor` targets the FormControl wrapper, not the input, so
 *  `getByLabel` cannot reach the control — locate the field by its item. */
function field(page: Page, label: string) {
  return page.locator('[data-slot="form-item"]').filter({ hasText: label });
}

test.describe("marketing posts admin", () => {
  const stamp = bulkStamp();

  test.afterAll(() => {
    purgeBulk(stamp, ["marketingPosts"]);
  });

  test("lists the newest post past the cap and loads its body on demand", async ({ page }) => {
    test.setTimeout(300_000);

    seedBulk("seedMarketingPosts", stamp, POST_COUNT);
    const target = newestLabel(stamp, POST_COUNT);

    await page.goto("/dashboard/marketing/work");
    const listItem = page.getByTestId("work-post-row").filter({ hasText: target }).getByRole("button").first();
    await expect(listItem).toBeVisible({ timeout: 40_000 });

    await listItem.click();
    await expect(page.getByText("Edit post")).toBeVisible({ timeout: 20_000 });

    const excerpt = field(page, "Excerpt").locator("textarea");
    await expect(field(page, "Title").locator("input")).toHaveValue(target, { timeout: 25_000 });
    await expect(excerpt).toHaveValue("E2E bulk seeded post.");

    // Saving round-trips the on-demand body back through `update`.
    await excerpt.fill("E2E bulk seeded post. Edited.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Post updated.")).toBeVisible({ timeout: 30_000 });

    // Publish is a header action; it saves the post and flips it live.
    const sheet = page.getByTestId("work-post-sheet");
    await sheet.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Post published.")).toBeVisible({ timeout: 30_000 });
    await expect(sheet.getByRole("button", { name: "Unpublish", exact: true })).toBeVisible();

    // `?post=` deep-links straight back into the editor.
    await page.reload();
    await expect(field(page, "Excerpt").locator("textarea")).toHaveValue(
      "E2E bulk seeded post. Edited.",
      { timeout: 25_000 },
    );
    await page.keyboard.press("Escape");
    await expect(
      page.getByTestId("work-post-row").filter({ hasText: target }),
    ).toContainText("Published");
  });
});
