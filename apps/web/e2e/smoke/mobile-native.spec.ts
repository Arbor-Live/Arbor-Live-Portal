import { test, expect, type Page } from "@playwright/test";

/**
 * Platform-layer mobile behavior from the root layout and globals.css:
 * the status-bar color follows the in-app theme, and fields are 16px on touch
 * screens so iOS doesn't zoom into them.
 */
test.use({ storageState: { cookies: [], origins: [] } });

// The first `theme-color` tag in the document is the one the browser uses.
const activeThemeColor = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content);

test.describe("mobile platform layer", () => {
  test("status bar follows an in-app dark theme across client navigation", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/sign-in");
    await expect.poll(() => activeThemeColor(page), { timeout: 30_000 }).toBe("#0c0c09");

    // Next re-renders its own metadata tags on navigation; ours must survive.
    await page.getByRole("link", { name: /forgot/i }).first().click();
    await page.waitForURL(/forgot-password/);
    await expect.poll(() => activeThemeColor(page)).toBe("#0c0c09");
  });

  test("fields are at least 16px on touch screens and keep their size with a mouse", async ({ browser }) => {
    const touch = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const mouse = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const fontSize = async (context: typeof touch) => {
        const page = await context.newPage();
        await page.goto("/sign-in");
        const field = page.getByRole("textbox").first();
        await expect(field).toBeVisible({ timeout: 30_000 });
        return field.evaluate((el) => getComputedStyle(el).fontSize);
      };
      expect(await fontSize(touch)).toBe("16px");
      expect(await fontSize(mouse)).toBe("14px");
    } finally {
      await touch.close();
      await mouse.close();
    }
  });
});
