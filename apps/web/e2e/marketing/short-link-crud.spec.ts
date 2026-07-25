import { test, expect } from "@playwright/test";
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

    // Delete confirms through window.confirm.
    page.on("dialog", (dialog) => void dialog.accept());

    await page.goto("/dashboard/marketing/links");
    await expect(page.getByText("Short links").first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "New" }).click();
    // FormLabel is not htmlFor-associated here, so target the placeholders.
    await page.getByPlaceholder("Spring show poster").fill(label);
    // Exact — "spring-show" is also a substring of the destination placeholder.
    await expect(page.getByPlaceholder("spring-show", { exact: true })).toHaveValue(slug, {
      timeout: 15_000,
    });
    await page
      .getByPlaceholder("https://arborlive.stanford.edu/work/spring-show")
      .fill(destinationUrl);

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Short link created.")).toBeVisible({ timeout: 25_000 });

    const created = await pollConvex<ShortLinkState>(
      "e2eHelpers:getShortLinkBySlug",
      { slug },
      (row) => row?.slug === slug,
    );
    expect(created.destinationUrl).toBe(destinationUrl);
    expect(created.label).toBe(label);
    expect(created.enabled).toBe(true);

    // The new link shows up in the list on the left.
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Short link deleted.")).toBeVisible({ timeout: 25_000 });

    await pollConvex(
      "e2eHelpers:getShortLinkBySlug",
      { slug },
      (row: ShortLinkState | null) => row === null,
    );
    expect(runConvex("e2eHelpers:getShortLinkBySlug", { slug })).toBeNull();
  });
});
