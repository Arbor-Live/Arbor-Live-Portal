import { test, expect } from "@playwright/test";
import { acceptAppDialog } from "../helpers/auth";
import { pollConvex, runConvex } from "../helpers/convex";

type ShortLinkState = {
  shortLinkId: string;
  slug: string;
  destinationUrl: string;
  label: string | null;
  enabled: boolean;
};

test.describe("short links", () => {
  test("admin can create a short link and then delete it", async ({ page }) => {
    test.setTimeout(120_000);

    const stamp = Date.now();
    const label = `E2E Link ${stamp}`;
    // The form slugifies the label; keep the expectation in sync with it.
    const slug = `e2e-link-${stamp}`;
    const destinationUrl = `https://arborlive.stanford.edu/work/e2e-${stamp}`;

    await page.goto("/dashboard/marketing/links");
    await expect(page.getByText("Short links").first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "New short link" }).click();
    const sheet = page.getByTestId("short-link-sheet");
    // FormLabel is not htmlFor-associated here, so target the placeholders.
    await page.getByPlaceholder("Spring show poster").fill(label);
    // Exact — "spring-show" is also a substring of the destination placeholder.
    await expect(page.getByPlaceholder("spring-show", { exact: true })).toHaveValue(slug, {
      timeout: 15_000,
    });
    await page
      .getByPlaceholder("https://arborlive.stanford.edu/work/spring-show")
      .fill(destinationUrl);

    await sheet.getByRole("button", { name: "Create short link", exact: true }).click();
    await expect(page.getByText("Short link created.")).toBeVisible({ timeout: 25_000 });
    // The panel closes once the save lands.
    await expect(sheet).toHaveCount(0, { timeout: 20_000 });

    const created = await pollConvex<ShortLinkState>(
      "e2eHelpers:getShortLinkBySlug",
      { slug },
      (row) => row?.slug === slug,
    );
    expect(created.destinationUrl).toBe(destinationUrl);
    expect(created.label).toBe(label);
    expect(created.enabled).toBe(true);

    // The new link shows up in the list; open it and delete it from its panel.
    const row = page.getByTestId(`short-link-row-${created.shortLinkId}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button").first().click();
    await page.getByTestId("short-link-sheet").getByRole("button", { name: "Delete", exact: true }).click();
    await acceptAppDialog(page, "Delete short link");
    await expect(page.getByText("Short link deleted.")).toBeVisible({ timeout: 25_000 });

    await pollConvex(
      "e2eHelpers:getShortLinkBySlug",
      { slug },
      (row: ShortLinkState | null) => row === null,
    );
    expect(runConvex("e2eHelpers:getShortLinkBySlug", { slug })).toBeNull();
  });

  test("an event's Promo tab makes a link that points at the event", async ({ page }) => {
    test.setTimeout(120_000);
    const seeded = runConvex("e2eHelpers:seedDryHireWithPullList", {
      title: `E2E Promo Link ${Date.now()}`,
    }) as { eventId: string; title: string; path: string };

    await page.goto(`${seeded.path}/promo`);
    const card = page.getByTestId("event-short-links");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "New short link" }).click();

    // Prefilled from the event: its title as the label, and the event linked.
    const sheet = page.getByTestId("short-link-sheet");
    await expect(sheet.getByPlaceholder("Spring show poster")).toHaveValue(seeded.title);
    await expect(sheet.getByTestId("searchable-select-trigger")).toContainText(seeded.title, { timeout: 20_000 });
    const destinationUrl = `https://arborlive.stanford.edu/work/e2e-promo-${Date.now()}`;
    await sheet.getByPlaceholder("https://arborlive.stanford.edu/work/spring-show").fill(destinationUrl);
    await sheet.getByRole("button", { name: "Create short link", exact: true }).click();
    await expect(sheet).toHaveCount(0, { timeout: 25_000 });

    await expect(card.locator("[data-testid^='event-short-link-']")).toHaveCount(1, { timeout: 25_000 });
    await expect(card).toContainText(destinationUrl);
  });
});
