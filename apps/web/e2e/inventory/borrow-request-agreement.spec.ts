import { test, expect, type Page } from "@playwright/test";
import { adminAuthFile, bandAuthFile, crewAuthFile } from "../helpers/auth";
import { pollConvex, runConvex } from "../helpers/convex";
import { pickSearchableOption } from "../helpers/select";

type BorrowRequestState = {
  requestId: string;
  status: string;
  requesterKind: string | null;
  requesterOrganizationName: string | null;
  convertedEventId: string | null;
  agreementSignedName: string | null;
  agreementTermKeys: string[];
};

const TERM_COUNT = 9;

/** Pick a pickup/return window a few days out, on the picker's visible month. */
async function fillBorrowWindow(page: Page) {
  const sheet = page.getByRole("dialog");
  await sheet.getByTestId("date-time-range-picker").click();
  const popover = page.locator("[data-slot='popover-content']").last();
  await expect(popover).toBeVisible({ timeout: 5_000 });
  const today = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", day: "numeric" }).format(
      new Date(),
    ),
  );
  let day = today + 2;
  if (day > 26) {
    await popover.getByRole("button", { name: /next/i }).click();
    day = 5;
  }
  await popover
    .locator("[data-slot='calendar'] button:not([data-outside])")
    .filter({ hasText: new RegExp(`^${day}$`) })
    .click();
  const times = popover.locator("input[type='time']");
  await times.nth(0).fill("10:00");
  await times.nth(1).fill("18:00");
  await page.keyboard.press("Escape");
}

/** Step 1 (details) → step 2 (agreement) → tick every term → e-sign → submit. */
async function submitBorrowRequest(
  page: Page,
  args: { purpose: string; typeName: string; signedName: string },
) {
  await page.getByRole("button", { name: "New borrow request" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Step 1 of 2")).toBeVisible({ timeout: 15_000 });

  await sheet.getByLabel("Purpose").fill(args.purpose);
  await fillBorrowWindow(page);
  await pickSearchableOption(
    page,
    sheet.getByTestId("searchable-select-trigger").last(),
    args.typeName,
    // The picked label also shows the model ("Name · Model").
    new RegExp(`^${args.typeName}`),
  );

  await sheet.getByRole("button", { name: "Continue to agreement" }).click();
  await expect(sheet.getByText("Step 2 of 2")).toBeVisible();
  await expect(sheet.getByText("You're on your own with this gear")).toBeVisible();

  const submit = sheet.getByRole("button", { name: "Sign and submit" });
  const signature = sheet.getByLabel("Full legal name (e-signature)");
  const checkboxes = sheet.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(TERM_COUNT);
  await expect(submit).toBeDisabled();
  await expect(signature).toBeDisabled();

  for (let index = 0; index < TERM_COUNT; index += 1) {
    await checkboxes.nth(index).click();
  }
  await expect(sheet.getByTestId("borrow-agreement-progress")).toHaveText(
    `${TERM_COUNT} of ${TERM_COUNT} confirmed`,
  );
  // Every box ticked but no signature yet — still can't submit.
  await expect(submit).toBeDisabled();

  await signature.fill(args.signedName);
  await submit.click();
  await expect(page.getByText("Borrow request submitted.")).toBeVisible({ timeout: 20_000 });
}

test.describe.serial("borrow request loan agreement", () => {
  const stamp = Date.now();
  const typeName = `E2E Borrow Speaker ${stamp}`;
  const crewPurpose = `E2E crew borrow ${stamp}`;
  const bandPurpose = `E2E artist borrow ${stamp}`;

  test.beforeAll(() => {
    runConvex("e2eHelpers:seedBorrowableInventoryType", { name: typeName });
  });

  test.describe("crew", () => {
    test.use({ storageState: crewAuthFile });

    test("crew must tick every term and e-sign before submitting", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/dashboard/inventory/borrow-requests");
      await expect(page.getByRole("heading", { name: "Borrow Requests" })).toBeVisible({
        timeout: 25_000,
      });

      await submitBorrowRequest(page, {
        purpose: crewPurpose,
        typeName,
        signedName: "Casey Crew",
      });

      const request = await pollConvex<BorrowRequestState>(
        "e2eHelpers:getLatestBorrowRequestByPurpose",
        { purpose: crewPurpose },
        (row) => row?.status === "submitted",
      );
      expect(request.requesterKind).toBe("crew");
      expect(request.agreementSignedName).toBe("Casey Crew");
      expect(request.agreementTermKeys).toHaveLength(TERM_COUNT);
    });
  });

  test.describe("admin", () => {
    test.use({ storageState: adminAuthFile });

    test("admin sees the signed agreement and approves", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/dashboard/inventory/borrow-requests");
      const card = page
        .getByTestId("borrow-requests-admin")
        .locator("div.rounded-md.border")
        .filter({ hasText: crewPurpose })
        .first();
      await expect(card).toBeVisible({ timeout: 25_000 });

      await card.getByText(/Loan agreement e-signed by/).click();
      await expect(card.getByText(/unsupported equipment loan/)).toBeVisible();

      await card.getByRole("button", { name: "Approve" }).click();
      await expect(page.getByText("Borrow request approved.")).toBeVisible({ timeout: 20_000 });

      const request = await pollConvex<BorrowRequestState>(
        "e2eHelpers:getLatestBorrowRequestByPurpose",
        { purpose: crewPurpose },
        (row) => row?.status === "approved",
      );
      expect(request.convertedEventId).not.toBeNull();
    });
  });

  test.describe("artist", () => {
    test.use({ storageState: bandAuthFile });

    test("artist borrows from their artist org with the same agreement", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/dashboard/artists/equipment");
      await expect(page.getByRole("heading", { name: "Equipment" })).toBeVisible({
        timeout: 25_000,
      });

      await submitBorrowRequest(page, {
        purpose: bandPurpose,
        typeName,
        signedName: "Alex Artist",
      });
      await expect(page.getByText(bandPurpose)).toBeVisible({ timeout: 20_000 });

      const request = await pollConvex<BorrowRequestState>(
        "e2eHelpers:getLatestBorrowRequestByPurpose",
        { purpose: bandPurpose },
        (row) => row?.status === "submitted",
      );
      expect(request.requesterKind).toBe("artist");
      expect(request.requesterOrganizationName).toBeTruthy();
      expect(request.agreementTermKeys).toHaveLength(TERM_COUNT);
    });
  });
});
