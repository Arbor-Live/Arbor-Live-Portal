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
 * The request detail's "Staff actions" panel: assignee assignment, staff notes,
 * and the submitted → in_review transition. These are all client-facing staff
 * edits that the convert/decline specs never touch.
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

    const assignee = page.getByTestId("searchable-select-trigger");
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

  test("staff notes + mark in review persist, and the button leaves after in_review", async ({ page }) => {
    const notes = `Follow up before Friday ${stamp}`;
    await page.goto(seeded.path);
    await expect(page.getByText(seeded.requestNumber).first()).toBeVisible({ timeout: 25_000 });

    await page.getByPlaceholder("Internal notes (optional)").fill(notes);
    await page.getByRole("button", { name: "Mark in review" }).click();

    const state = await pollConvex<{
      status: string;
      staffNotes: string | null;
      reviewedAt: number | null;
      reviewedByUserId: string | null;
    }>(
      "e2eHelpers:getBookingRequestState",
      { requestId: seeded.requestId },
      (row) => row?.status === "in_review" && row.staffNotes === notes && row.reviewedAt != null,
    );
    expect(state.status).toBe("in_review");
    expect(state.reviewedByUserId).toBeTruthy();

    // Reload: the persisted staff notes render in the details, and "Mark in
    // review" only exists for submitted requests.
    await page.reload();
    await expect(page.getByText(notes).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("button", { name: "Mark in review" })).toHaveCount(0);
    // The rest of the panel is still editable while in_review.
    await expect(page.getByPlaceholder("Internal notes (optional)")).toBeVisible();
  });
});
