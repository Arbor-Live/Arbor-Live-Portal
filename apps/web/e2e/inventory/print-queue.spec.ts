import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

type PrintQueueState = {
  printers: Array<{ queueName: string; enabled: boolean; lastSeenAt?: number }>;
  jobs: Array<{ _id: string; eventId: string; status: string; error?: string }>;
};

test.describe("print queue", () => {
  test("shows printer status and reprints a queued brief", async ({ page }) => {
    test.setTimeout(120_000);
    const { queueName } = runConvex("e2eHelpers:seedPrinter", {
      queueName: "e2e-wh1",
    }) as { printerId: string; queueName: string };
    const title = `E2E Brief ${Date.now()}`;
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", { title }) as {
      eventId: string;
    };

    const { jobId } = runConvex("e2eHelpers:enqueueBriefForEvent", {
      eventId: seeded.eventId,
    }) as { jobId: string | null };
    expect(jobId).toBeTruthy();

    // The render action stores the PDF and flips the job to ready.
    await pollConvex<PrintQueueState>(
      "e2eHelpers:getPrintQueueState",
      { eventId: seeded.eventId },
      (row) => Boolean(row?.jobs.some((job) => job.status === "ready" || job.status === "printed")),
    );

    await page.goto("/dashboard/inventory/print-queue");
    // The printer cards are nested inside the "Printers" card, so the queue-name
    // filter matches both the wrapper and the card itself; drop the wrapper.
    const printerCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: `Queue: ${queueName}` })
      .filter({ hasNot: page.locator('[data-slot="card"]') });
    await expect(printerCard).toBeVisible({ timeout: 30_000 });
    await expect(printerCard.getByText(queueName, { exact: true })).toBeVisible();
    await expect(printerCard.getByText("Online", { exact: true })).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText(/Ready|Printed/)).toBeVisible();

    await row.getByRole("button", { name: "Reprint" }).click();
    await pollConvex<PrintQueueState>(
      "e2eHelpers:getPrintQueueState",
      { eventId: seeded.eventId },
      (state) => Boolean(state && state.jobs.length >= 2),
    );
    await expect(page.getByRole("row").filter({ hasText: title })).toHaveCount(2, {
      timeout: 20_000,
    });
  });

  test("downloads the event brief from the editor", async ({ page }) => {
    test.setTimeout(120_000);
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Brief Download ${Date.now()}`,
    }) as { eventId: string; path: string };

    await page.goto(seeded.path);
    const downloadButton = page.getByRole("button", { name: "Download brief" });
    await expect(downloadButton).toBeVisible({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      downloadButton.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/-brief\.pdf$/);
  });
});
