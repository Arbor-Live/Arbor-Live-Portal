import { test, expect } from "@playwright/test";
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
 * Mentions are parsed from the body (`@Name`), so the typeahead must insert the
 * candidate's display name verbatim. Persistence is asserted via Convex so a
 * UI-only success that never reached `eventComments.createComment` still fails.
 */
test.describe("event comments and mentions", () => {
  test("admin can @-mention a teammate and the mention persists", async ({ page }) => {
    const stamp = Date.now();
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };

    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Comments ${stamp}`,
    }) as { eventId: string; path: string };

    await page.goto(seeded.path);
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("event-comments")).toBeVisible({ timeout: 30_000 });

    const input = page.getByTestId("event-comment-input");
    await input.click();
    await input.pressSequentially(`@${e2eEnv.crewName.slice(0, 6)}`, { delay: 40 });

    const menu = page.getByTestId("event-comment-mention-menu");
    await expect(menu).toBeVisible({ timeout: 15_000 });
    await menu.getByRole("option", { name: new RegExp(e2eEnv.crewName, "i") }).click();

    await expect(input).toHaveValue(new RegExp(`@${e2eEnv.crewName}`));
    await input.pressSequentially(` please check the pull list ${stamp}`, { delay: 20 });
    await page.getByTestId("event-comment-post").click();

    await expect(page.getByTestId("event-comment-row").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("event-comment-body").first()).toContainText(
      `@${e2eEnv.crewName}`,
    );
    await expect(page.getByTestId("event-comment-body").first()).toContainText(String(stamp));

    const comments = await pollConvex<CommentState[]>(
      "e2eHelpers:getEventCommentsState",
      { eventId: seeded.eventId },
      (rows) => Array.isArray(rows) && rows.some((row) => row.body.includes(String(stamp))),
    );
    const posted = comments.find((row) => row.body.includes(String(stamp)));
    expect(posted).toBeTruthy();
    expect(posted!.body).toContain(`@${e2eEnv.crewName}`);
    expect(posted!.mentionedUserIds).toContain(crew.userId);
  });
});
