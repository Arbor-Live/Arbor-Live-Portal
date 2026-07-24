import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("public quote approval", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("client can approve a seeded public quote", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedApprovablePublicQuote", {}) as {
      path: string;
      publicApprovalToken: string;
    };

    await page.goto(seeded.path);
    await expect(page.getByText(/Terms & Conditions/i).first()).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder("Jordan Lee").fill("E2E Approver");
    await page.getByText("I will be submitting the payment").click();
    await page.getByRole("button", { name: "Approve quote" }).click();

    await expect(page.getByText(/Approved on/i).first()).toBeVisible({ timeout: 20_000 });

    const state = await pollConvex<{ clientApprovalStatus: string }>(
      "e2eHelpers:getInvoiceApprovalState",
      { token: seeded.publicApprovalToken },
      (row) => row?.clientApprovalStatus === "approved",
    );
    expect(state.clientApprovalStatus).toBe("approved");
  });

  test("client can request changes on a seeded public quote", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedApprovablePublicQuote", {}) as {
      path: string;
      publicApprovalToken: string;
    };

    await page.goto(seeded.path);
    await expect(page.getByText(/Request Changes/i).first()).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder("Tell us what changes are needed").fill("Please reduce crew hours.");
    await page.getByRole("button", { name: "Request changes" }).click();

    await expect(page.getByText(/Changes requested on/i).first()).toBeVisible({ timeout: 20_000 });

    const state = await pollConvex<{ clientApprovalStatus: string }>(
      "e2eHelpers:getInvoiceApprovalState",
      { token: seeded.publicApprovalToken },
      (row) => row?.clientApprovalStatus === "changes_requested",
    );
    expect(state.clientApprovalStatus).toBe("changes_requested");
  });

  test("client can submit payment proof on an approved linked quote", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedApprovedQuoteWithLinkedEvent", {}) as {
      path: string;
    };

    await page.goto(seeded.path);
    await expect(page.getByText(/Submit Payment Proof/i).first()).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder("24278").fill("987654");
    await page.getByRole("button", { name: "Submit payment proof" }).click();

    await expect(page.getByText(/Payment Proof Submitted/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
