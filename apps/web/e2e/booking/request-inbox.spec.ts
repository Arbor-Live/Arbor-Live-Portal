import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { editFilter } from "../helpers/filter-bar";

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
 * Fixtures are four requests in one seed pass so the assertions observe the
 * *same* rows across filters, and `afterAll` deletes them so the shared
 * deployment's `.take(100)` inbox window never fills with stale rows.
 */
test.describe("booking request inbox", () => {
  const stamp = Date.now();
  const seeds: Record<string, Seed> = {};

  test.beforeAll(() => {
    for (const [key, status] of [
      ["submitted", "submitted"],
      ["actionRequired", "action_required"],
      ["pendingClient", "pending_client"],
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

  test("open view lists follow-up requests, collapses pending client, hides completed", async ({
    page,
  }) => {
    await page.goto("/dashboard/financial-hub/requests");

    await expect(page.getByText(seeds.submitted.requestNumber).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(seeds.actionRequired.requestNumber).first()).toBeVisible();
    await expect(page.getByText(seeds.declined.requestNumber)).toHaveCount(0);

    // Pending client stays in the open list but collapsed by default.
    await expect(page.getByText(seeds.pendingClient.requestNumber)).toHaveCount(0);
    const pendingToggle = page.getByTestId("request-group-pending_client").getByRole("button", { name: "Show" });
    await expect(pendingToggle).toBeVisible();
    await pendingToggle.click();
    await expect(page.getByText(seeds.pendingClient.requestNumber).first()).toBeVisible();
  });

  test("declined filter shows only the declined request", async ({ page }) => {
    await page.goto("/dashboard/financial-hub/requests");
    await expect(page.getByText(seeds.submitted.requestNumber).first()).toBeVisible({
      timeout: 25_000,
    });

    // The open view is a "Status is not Converted, Declined" chip; flip it to "is Declined".
    await expect(page.getByTestId("filter-chip-status")).toContainText("Status is not Converted, Declined");
    await editFilter(page, "status", { operator: "is", toggle: ["Converted"] });
    await expect(page.getByTestId("filter-chip-status")).toContainText("Status is Declined");

    await expect(page.getByText(seeds.declined.requestNumber).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(seeds.submitted.requestNumber)).toHaveCount(0);
    await expect(page.getByText(seeds.actionRequired.requestNumber)).toHaveCount(0);
    await expect(page.getByText(seeds.pendingClient.requestNumber)).toHaveCount(0);
  });

  test("all statuses includes terminal requests", async ({ page }) => {
    await page.goto("/dashboard/financial-hub/requests");
    await expect(page.getByText(seeds.submitted.requestNumber).first()).toBeVisible({
      timeout: 25_000,
    });

    // Removing the open-view chip shows every status.
    await page.getByRole("button", { name: "Remove the Status filter" }).click();

    await expect(page.getByText(seeds.declined.requestNumber).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(seeds.submitted.requestNumber).first()).toBeVisible();
    await expect(page.getByText(seeds.actionRequired.requestNumber).first()).toBeVisible();
    await expect(page.getByText(seeds.pendingClient.requestNumber).first()).toBeVisible();
  });
});
