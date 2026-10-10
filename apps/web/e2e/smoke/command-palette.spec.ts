import { test, expect, type Page } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { runConvex } from "../helpers/convex";

async function openPalette(page: Page) {
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible({ timeout: 45_000 });
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByRole("dialog").getByRole("combobox");
  await expect(input).toBeFocused();
  return input;
}

test.describe("command palette", () => {
  test("admin jumps to a page, an event and an invoice", async ({ page }, testInfo) => {
    const stamp = Date.now();
    const event = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `Palette Gala ${stamp}`,
    }) as { eventId: string };
    const quote = runConvex("e2eHelpers:seedApprovedQuoteWithLinkedEvent", {
      clientGroupName: `Palette Host ${stamp}`,
    }) as { invoiceId: string; invoiceNumber: string };

    let input = await openPalette(page);
    await input.fill("venues");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard\/events\/venues$/);

    input = await openPalette(page);
    await input.fill(`Palette Gala ${stamp}`);
    const eventOption = page.getByRole("option", { name: new RegExp(`Palette Gala ${stamp}`) });
    await expect(eventOption).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: testInfo.outputPath("command-palette-event.png") });
    await eventOption.click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/events/${event.eventId}$`));

    // The number's random suffix, typed in lowercase.
    input = await openPalette(page);
    await input.fill(quote.invoiceNumber.replace("ALINV-", "").slice(0, 5).toLowerCase());
    const invoiceOption = page.getByRole("option", { name: new RegExp(quote.invoiceNumber) });
    await expect(invoiceOption).toBeVisible({ timeout: 15_000 });
    await expect(invoiceOption).toContainText(`Palette Host ${stamp}`);
    await invoiceOption.click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/ops-center/invoices/${quote.invoiceId}$`));
  });

  test.describe("crew", () => {
    test.use({ storageState: crewAuthFile });

    test("finds events but not invoices", async ({ page }) => {
      const stamp = Date.now();
      runConvex("e2eHelpers:seedCrewedEventWithSchedule", { title: `Palette Crew Night ${stamp}` });
      runConvex("e2eHelpers:seedApprovedQuoteWithLinkedEvent", {
        clientGroupName: `Palette Crew Night ${stamp}`,
      });

      const input = await openPalette(page);
      await input.fill(`Palette Crew Night ${stamp}`);
      await expect(
        page.getByRole("option", { name: new RegExp(`Palette Crew Night ${stamp}`) }),
      ).toHaveCount(1, { timeout: 15_000 });
      await expect(page.getByRole("dialog").getByText("Invoices", { exact: true })).toHaveCount(0);
    });
  });
});
