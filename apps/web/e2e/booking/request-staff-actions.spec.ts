import { test, expect } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";
import { pickSearchableOption } from "../helpers/select";

type Seed = {
  requestId: string;
  requestNumber: string;
  publicToken: string;
  path: string;
  trackPath: string;
};

/**
 * The request detail's staff edits: assignee assignment (aside), staff notes
 * (Notes card), and the submitted → action_required transition (header ⋯ menu).
 * The convert/decline specs never touch these.
 */
test.describe("booking request staff actions", () => {
  const stamp = Date.now();
  let seeded: Seed;

  test.beforeAll(() => {
    seeded = runConvex("e2eHelpers:seedSubmittedBookingRequest", {
      eventName: `E2E Staff Actions ${stamp}`,
    }) as Seed;
  });

  test.afterAll(() => {
    runConvex("e2eHelpers:deleteBookingRequestFixture", { requestId: seeded.requestId });
  });

  test("assignee assignment sticks and is recorded on the row", async ({ page }) => {
    await page.goto(seeded.path);
    await expect(page.getByText(seeded.requestNumber).first()).toBeVisible({ timeout: 25_000 });

    const assignee = page
      .getByTestId("request-assignee-picker")
      .getByTestId("searchable-select-trigger");
    await pickSearchableOption(page, assignee, e2eEnv.adminName, e2eEnv.adminName);

    const state = await pollConvex<{
      assigneeUserId: string | null;
      assigneeName: string | null;
    }>(
      "e2eHelpers:getBookingRequestState",
      { requestId: seeded.requestId },
      (row) => Boolean(row?.assigneeUserId),
    );
    expect(state.assigneeUserId).toBeTruthy();
    expect(state.assigneeName).toBe(e2eEnv.adminName);
  });

  test("staff notes + mark action required persist, and the button leaves after", async ({
    page,
  }) => {
    const notes = `Follow up before Friday ${stamp}`;
    await page.goto(seeded.path);
    await expect(page.getByText(seeded.requestNumber).first()).toBeVisible({ timeout: 25_000 });

    // Unsaved notes ride along with the status change.
    await page.getByLabel("Staff notes").fill(notes);
    await page.getByRole("button", { name: "More request actions" }).click();
    await page.getByRole("menuitem", { name: "Mark action required" }).click();

    const state = await pollConvex<{
      status: string;
      staffNotes: string | null;
      reviewedAt: number | null;
      reviewedByUserId: string | null;
    }>(
      "e2eHelpers:getBookingRequestState",
      { requestId: seeded.requestId },
      (row) =>
        row?.status === "action_required" && row.staffNotes === notes && row.reviewedAt != null,
    );
    expect(state.status).toBe("action_required");
    expect(state.reviewedByUserId).toBeTruthy();

    // Reload: the persisted staff notes load into the editor, and "Mark
    // action required" only exists for submitted requests.
    await page.reload();
    await expect(page.getByTestId("request-status")).toHaveText("Action required", {
      timeout: 25_000,
    });
    await expect(page.getByLabel("Staff notes")).toHaveValue(notes);
    await page.getByRole("button", { name: "More request actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Decline request" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Mark action required" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("staff notes save on their own, without a status change", async ({ page }) => {
    const notes = `Called the venue ${stamp}`;
    await page.goto(seeded.path);
    await expect(page.getByText(seeded.requestNumber).first()).toBeVisible({ timeout: 25_000 });

    await page.getByLabel("Staff notes").fill(notes);
    await page.getByRole("button", { name: "Save notes" }).click();

    const state = await pollConvex<{ status: string; staffNotes: string | null }>(
      "e2eHelpers:getBookingRequestState",
      { requestId: seeded.requestId },
      (row) => row?.staffNotes === notes,
    );
    expect(state.status).toBe("action_required");
    await expect(page.getByRole("button", { name: "Save notes" })).toBeDisabled();
  });
});
