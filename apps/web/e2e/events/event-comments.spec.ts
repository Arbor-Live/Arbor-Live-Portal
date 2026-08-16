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
 * Mentions are parsed from the body (`@Name`), so the typeahead must insert the
 * candidate's display name verbatim. Persistence is asserted via Convex so a
 * UI-only success that never reached `comments.createComment` still fails.
 *
 * The active-mention query rejects whitespace, so typeahead input must stay on a
 * single token (e.g. `@Crew`, not `@E2E Cr`) until a candidate is chosen.
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

    const comments = page.getByTestId("comments");
    await expect(comments).toBeVisible({ timeout: 30_000 });
    // Wait until mention candidates have loaded; an empty [] while still loading
    // would keep the typeahead menu closed.
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
    // Space-free token so getActiveMention stays open; "Crew" matches "E2E Crew".
    await input.pressSequentially("@Crew", { delay: 40 });

    const menu = page.getByTestId("comment-mention-menu");
    await expect(menu).toBeVisible({ timeout: 15_000 });
    // Match on the stable crew email, not the name: `smoke/invite.spec.ts`
    // creates a new "E2E Crew"-named member on every run, so a name-scoped
    // locator strict-violates once more than one of those has accumulated on a
    // shared deployment.
    await menu.getByRole("option", { name: new RegExp(e2eEnv.crewEmail, "i") }).click();

    await expect(input).toHaveValue(new RegExp(`@${e2eEnv.crewName}`));
    await input.pressSequentially(` please check the pull list ${stamp}`, { delay: 20 });
    await page.getByTestId("comment-post").click();

    await expect(page.getByTestId("comment-row").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("comment-body").first()).toContainText(
      `@${e2eEnv.crewName}`,
    );
    await expect(page.getByTestId("comment-body").first()).toContainText(String(stamp));

    const saved = await pollConvex<CommentState[]>(
      "e2eHelpers:getCommentsState",
      { subjectType: "event", subjectId: seeded.eventId },
      (rows) => Array.isArray(rows) && rows.some((row) => row.body.includes(String(stamp))),
    );
    const posted = saved.find((row) => row.body.includes(String(stamp)));
    expect(posted).toBeTruthy();
    expect(posted!.body).toContain(`@${e2eEnv.crewName}`);
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
