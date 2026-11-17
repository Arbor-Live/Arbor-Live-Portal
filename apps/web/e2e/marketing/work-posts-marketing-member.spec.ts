import { test, expect } from "@playwright/test";
import { signInWithCredentials } from "../helpers/auth";
import { newestLabel, purgeBulk, seedBulk, bulkStamp } from "../helpers/bulk-seed";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";

const shotDir = process.env.E2E_SHOT_DIR;
const marketer = {
  email: "e2e-marketing@arborlive.test",
  password: e2eEnv.crewPassword,
  name: "E2E Marketing Member",
};

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("work posts for the Marketing team", () => {
  const stamp = bulkStamp();

  test.afterAll(() => {
    purgeBulk(stamp, ["marketingPosts"]);
  });

  test("a Marketing member who is not an admin can open and edit a work post", async ({ page }) => {
    test.setTimeout(180_000);
    runConvex("e2eHelpers:ensureCrewUser", { ...marketer, verticals: ["Crew", "Marketing"] });
    seedBulk("seedMarketingPosts", stamp, 1);
    const target = newestLabel(stamp, 1);

    await signInWithCredentials(page, marketer.email, marketer.password);
    await page.goto("/dashboard/marketing/work");
    const row = page.getByTestId("work-post-row").filter({ hasText: target });
    await expect(row).toBeVisible({ timeout: 40_000 });
    if (shotDir) await page.screenshot({ path: `${shotDir}/work-list.png` });

    await row.getByRole("button").first().click();
    const excerpt = page.getByLabel("Excerpt", { exact: true });
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(target, { timeout: 25_000 });
    await excerpt.fill("Edited by the Marketing team.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Post updated.")).toBeVisible({ timeout: 30_000 });
    if (shotDir) await page.screenshot({ path: `${shotDir}/work-saved.png` });
  });
});
