import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { pickSearchableOption } from "../helpers/select";

type Seed = {
  requestId: string;
  requestNumber: string;
  publicToken: string;
  path: string;
  trackPath: string;
};

/**
 * Dedicated request-inbox UX coverage. The convert/decline specs navigate
 * straight to the detail route, so the inbox's status filter and its default
 * "Open (hide completed)" behaviour had no test of their own.
 *
 * Fixtures are three requests in one seed pass so the assertions observe the
 * *same* rows across filters, and `afterAll` deletes them so the shared
 * deployment's `.take(100)` inbox window never fills with stale rows.
 */
test.describe("booking request inbox", () => {
  const stamp = Date.now();
  const seeds: Record<string, Seed> = {};

  test.beforeAll(() => {
    for (const [key, status] of [
      ["submitted", "submitted"],
      ["inReview", "in_review"],
      ["declined", "declined"],
    ] as const) {
      seeds[key] = runConvex("e2eHelpers:seedSubmittedBookingRequest", {
        eventName: `E2E Inbox ${stamp} ${key}`,
        status,
      }) as Seed;
    }
  });

  test.afterAll(() => {
    for (const seed of Object.values(seeds)) {
      runConvex("e2eHelpers:deleteBookingRequestFixture", { requestId: seed.requestId });
    }
  });

  test("open view lists submitted + in-review and hides completed", async ({ page }) => {
    await page.goto("/dashboard/events/requests");

    await expect(page.getByText(seeds.submitted.requestNumber).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(seeds.inReview.requestNumber).first()).toBeVisible();
    await expect(page.getByText(seeds.declined.requestNumber)).toHaveCount(0);
  });

  test("declined filter shows only the declined request", async ({ page }) => {
    await page.goto("/dashboard/events/requests");
    await expect(page.getByText(seeds.submitted.requestNumber).first()).toBeVisible({
      timeout: 25_000,
    });

    const filter = page.getByTestId("searchable-select-trigger");
    await pickSearchableOption(page, filter, "Declined", "Declined");

    await expect(page.getByText(seeds.declined.requestNumber).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(seeds.submitted.requestNumber)).toHaveCount(0);
    await expect(page.getByText(seeds.inReview.requestNumber)).toHaveCount(0);
  });

  test("all statuses includes terminal requests", async ({ page }) => {
    await page.goto("/dashboard/events/requests");
    await expect(page.getByText(seeds.submitted.requestNumber).first()).toBeVisible({
      timeout: 25_000,
    });

    const filter = page.getByTestId("searchable-select-trigger");
    await pickSearchableOption(page, filter, "All statuses", "All statuses");

    await expect(page.getByText(seeds.declined.requestNumber).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(seeds.submitted.requestNumber).first()).toBeVisible();
    await expect(page.getByText(seeds.inReview.requestNumber).first()).toBeVisible();
  });
});
