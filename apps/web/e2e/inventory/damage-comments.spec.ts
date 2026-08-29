import { test, expect } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";
import { fillSearchableSelectQuery } from "../helpers/select";

type CommentState = {
  body: string;
  authorUserId: string;
  mentionedUserIds: string[];
  createdAt: number;
};

/**
 * Damage report comments + @mentions via UserSelect.
 *
 * Threads key on the report's `batchId`, not its id, so the sibling rows one
 * submission creates share one conversation — the assertion below reads the
 * thread by `batchId` to lock that in. Persistence is asserted via Convex so a
 * UI-only success that never reached `comments.createComment` still fails.
 */
test.describe("damage report comments and mentions", () => {
  test("admin can mention a teammate on a damage report", async ({ page }) => {
    const stamp = Date.now();
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
      username: e2eEnv.crewUsername,
    }) as { userId: string };

    const seeded = runConvex("e2eHelpers:seedOpenDamageReport", {}) as {
      reportId: string;
      assetId: string;
      batchId: string;
      queuePath: string;
    };

    // The mention email deep-links straight into the sheet via `?report=`, so
    // exercise that path rather than clicking through the queue.
    await page.goto(`${seeded.queuePath}?report=${seeded.reportId}`);
    const sheet = page.getByTestId("damage-report-sheet");
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await expect(sheet).toContainText(seeded.assetId, { timeout: 20_000 });

    const comments = page.getByTestId("comments");
    await expect(comments).toBeVisible({ timeout: 30_000 });
    await expect(comments).not.toHaveAttribute("data-mention-candidates", "loading", {
      timeout: 30_000,
    });
    await expect
      .poll(async () => Number(await comments.getAttribute("data-mention-candidates")), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    const input = page.getByTestId("comment-input");
    const trigger = comments
      .getByTestId("comment-mention-picker")
      .getByTestId("searchable-select-trigger");
    await trigger.click();
    const menu = page.getByTestId("searchable-select-menu");
    await expect(menu).toBeVisible({ timeout: 15_000 });
    await fillSearchableSelectQuery(menu, "Crew");
    // Match on the stable crew email, not the name: `smoke/invite.spec.ts`
    // creates a new "E2E Crew"-named member on every run, so a name-scoped
    // locator strict-violates once more than one of those has accumulated on a
    // shared deployment.
    await menu.getByRole("option", { name: new RegExp(e2eEnv.crewEmail, "i") }).click({
      force: true,
    });
    await expect(menu).toHaveCount(0, { timeout: 15_000 });

    await expect(input).toHaveValue(new RegExp(`@${e2eEnv.crewUsername}`));
    await input.pressSequentially(` can you pull a spare ${stamp}`, { delay: 20 });
    await page.getByTestId("comment-post").click();

    await expect(page.getByTestId("comment-body").first()).toContainText(String(stamp), {
      timeout: 20_000,
    });

    // Keyed by batchId: a thread keyed on the report id would return nothing.
    const saved = await pollConvex<CommentState[]>(
      "e2eHelpers:getCommentsState",
      { subjectType: "damage_batch", subjectId: seeded.batchId },
      (rows) => Array.isArray(rows) && rows.some((row) => row.body.includes(String(stamp))),
    );
    const posted = saved.find((row) => row.body.includes(String(stamp)));
    expect(posted).toBeTruthy();
    expect(posted!.body).toContain(`@${e2eEnv.crewUsername}`);
    expect(posted!.mentionedUserIds).toContain(crew.userId);

    // The queue card surfaces the thread size once the sheet is dismissed.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 15_000 });
    const card = page
      .locator('[data-slot="card"]')
      .filter({ hasText: seeded.assetId })
      .first();
    await expect(card.getByTestId("damage-comment-count")).toContainText("1 comment", {
      timeout: 20_000,
    });
  });
});
