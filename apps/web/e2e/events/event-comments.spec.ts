import { test, expect } from "@playwright/test";
import { acceptAppDialog } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";

type CommentState = {
  body: string;
  authorUserId: string;
  mentionedUserIds: string[];
  createdAt: number;
};

/**
 * Event comments + inline @mentions.
 *
 * Typing `@` in the comment box opens a suggestion popup; picking a teammate
 * inserts their handle inline. Persistence is asserted via Convex so a
 * UI-only success that never reached `comments.createComment` still fails.
 */
test.describe("event comments and mentions", () => {
  test("admin can mention a teammate and the mention persists", async ({ page }) => {
    const stamp = Date.now();
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
      username: e2eEnv.crewUsername,
    }) as { userId: string; username?: string };
    const mentionHandle = crew.username || e2eEnv.crewName;

    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Comments ${stamp}`,
    }) as { eventId: string; path: string };

    await page.goto(seeded.path);
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 45_000 });

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
    await input.click();
    await input.pressSequentially(`@${mentionHandle}`, { delay: 20 });
    const picker = page.getByTestId("comment-mention-picker");
    await expect(picker).toBeVisible({ timeout: 15_000 });
    // Match on the stable crew email, not the name: `smoke/invite.spec.ts`
    // creates a new "E2E Crew"-named member on every run, so a name-scoped
    // locator strict-violates once more than one of those has accumulated on a
    // shared deployment.
    await picker.getByRole("option", { name: new RegExp(e2eEnv.crewEmail, "i") }).click();
    await expect(picker).toBeHidden({ timeout: 15_000 });

    await expect(input).toHaveValue(new RegExp(`@${mentionHandle}`));
    await input.pressSequentially(` please check the pull list ${stamp}`, { delay: 20 });
    await page.getByTestId("comment-post").click();

    await expect(page.getByTestId("comment-row").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("comment-body").first()).toContainText(`@${mentionHandle}`);
    await expect(page.getByTestId("comment-body").first()).toContainText(String(stamp));

    const saved = await pollConvex<CommentState[]>(
      "e2eHelpers:getCommentsState",
      { subjectType: "event", subjectId: seeded.eventId },
      (rows) => Array.isArray(rows) && rows.some((row) => row.body.includes(String(stamp))),
    );
    const posted = saved.find((row) => row.body.includes(String(stamp)));
    expect(posted).toBeTruthy();
    expect(posted!.body).toContain(`@${mentionHandle}`);
    expect(posted!.mentionedUserIds).toContain(crew.userId);

    const postedRow = page
      .getByTestId("comment-row")
      .filter({ hasText: String(stamp) });
    await postedRow.getByTestId("comment-delete").click();
    await acceptAppDialog(page, "Delete");
    await expect(postedRow).toHaveCount(0, { timeout: 20_000 });

    await pollConvex<CommentState[]>(
      "e2eHelpers:getCommentsState",
      { subjectType: "event", subjectId: seeded.eventId },
      (rows) => Array.isArray(rows) && !rows.some((row) => row.body.includes(String(stamp))),
    );
  });
});
