import { test, expect } from "@playwright/test";
import { newestLabel, purgeBulk, seedBulk, bulkStamp } from "../helpers/bulk-seed";

/**
 * `shortLinks.list` took 500 rows in index order, then sorted by recency, and
 * resolved the linked event title once per link. This seeds past the cap with
 * every link pointing at a single event, so it covers the ordering fix and the
 * de-duplicated event lookup at once.
 */
const LINK_COUNT = 250;

test.describe("short link list recency", () => {
  const stamp = bulkStamp();

  test.afterAll(() => {
    purgeBulk(stamp, ["shortLinks", "events"]);
  });

  test("shows the newest short link past the cap, with its linked event intact", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const event = seedBulk("seedEvents", stamp, 1) as { lastEventId: string };
    const eventTitle = newestLabel(stamp, 1);
    seedBulk("seedShortLinks", stamp, LINK_COUNT, { eventId: event.lastEventId });
    const target = newestLabel(stamp, LINK_COUNT);

    await page.goto("/dashboard/marketing/links");
    await expect(page.getByText("Short links").first()).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder("Search slug, label, or URL…").fill(target);

    const listItem = page.getByRole("button").filter({ hasText: target });
    await expect(listItem).toBeVisible({ timeout: 40_000 });

    // Opening it hydrates the selection through `events.getOptionsByIds`, which
    // must resolve the label without loading the events catalog.
    await listItem.click();
    await expect(page.getByTestId("searchable-select-trigger")).toContainText(eventTitle, {
      timeout: 25_000,
    });
  });
});
