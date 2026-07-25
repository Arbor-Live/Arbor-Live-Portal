import { test, expect } from "@playwright/test";

const directories = [
  { path: "/crew", heading: "The Team" },
  { path: "/artists", heading: "Artists" },
  { path: "/events", heading: "Upcoming events" },
] as const;

test.describe("public directories", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const { path, heading } of directories) {
    test(`${path} renders for signed-out visitors`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });
      // Client-side Convex queries should settle without an error boundary.
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    });
  }
});
