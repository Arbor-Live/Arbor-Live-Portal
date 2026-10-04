import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("booking track approve", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("client approves a booking quote on the request track link", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedBookingReadyForTrackApprove", {
      eventName: `E2E Track Approve ${Date.now()}`,
    }) as {
      requestId: string;
      trackPath: string;
    };

    await page.goto(`${seeded.trackPath}?tab=quote`);
    await expect(page.getByText(/Terms & Conditions|Approve quote/i).first()).toBeVisible({
      timeout: 25_000,
    });

    await page.getByPlaceholder("Jordan Lee").fill("E2E Track Approver");
    await page.getByText("I will be submitting the payment").click();
    await page.getByRole("button", { name: "Approve quote" }).click();
    await expect(page.getByText(/Approved on/i).first()).toBeVisible({ timeout: 20_000 });

    const state = await pollConvex<{ status: string; convertedAt: number | null }>(
      "e2eHelpers:getBookingRequestState",
      { requestId: seeded.requestId },
      (row) => row?.status === "converted" && row.convertedAt != null,
    );
    expect(state.status).toBe("converted");
    expect(state.convertedAt).toBeTruthy();
  });

  test("client reads the quote's crew by day and section, with headcount per phase", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedBookingReadyForTrackApprove", {
      eventName: `E2E Track Crew ${Date.now()}`,
      crew: "multi_day",
    }) as { trackPath: string };

    await page.goto(`${seeded.trackPath}?tab=quote`);
    const crew = page.getByTestId("public-quote-crew");
    await expect(crew).toBeVisible({ timeout: 25_000 });

    await expect(crew.getByRole("heading", { name: "Day 1" })).toBeVisible();
    await expect(crew.getByRole("heading", { name: "Day 2" })).toBeVisible();
    const sections = crew.getByTestId("public-quote-crew-section");
    // Load-in / Show / Strike on each day, plus the hand-entered row.
    await expect(sections).toHaveCount(7);
    const loadIn = sections.first();
    await expect(loadIn.getByTestId("public-quote-crew-headcount")).toHaveText("4 people × 3 hrs");
    await expect(loadIn).toContainText("$312.00");
    await expect(sections.nth(1).getByTestId("public-quote-crew-headcount")).toHaveText("2 people × 4.5 hrs");
    await expect(sections.last().getByTestId("public-quote-crew-headcount")).toHaveText("2 people × 1.5 hrs");

    // Opening a section shows who works it at what rate.
    await loadIn.locator("summary").click();
    const lead = loadIn.getByTestId("public-quote-crew-line").first();
    await expect(lead).toContainText("Maximiliano Fernández-Castellanos");
    await expect(lead).toContainText("Lead");
    await expect(lead).toContainText("3 hrs × $35/hr");
    await expect(loadIn.getByText("To be assigned")).toBeVisible();

    // Presentation only: the crew total still matches the billed crew subtotal.
    await expect(crew.getByTestId("public-quote-crew-total")).toHaveText("$1,506.00");
    await expect(page.getByText("Crew: $1,506.00")).toBeVisible();
  });
});
