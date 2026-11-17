import { test, expect, type Page } from "@playwright/test";
import { adminAuthFile, bandAuthFile, crewAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";
import { pickSearchableOption } from "../helpers/select";

type BorrowRequestState = {
  requestId: string;
  status: string;
  convertedEventId: string | null;
  agreementSignedName: string | null;
  agreementTermKeys: string[];
  requesterOrganizationName: string | null;
  usedOffCampus: boolean | null;
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
  args: { purpose: string; typeName: string; signedName: string; offCampus?: boolean },
) {
  // The header's button; an empty Mine list has a second one in its empty state.
  await page
    .getByTestId("borrow-requests-page")
    .locator("header")
    .getByRole("button", { name: "New borrow request" })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Step 1 of 2")).toBeVisible({ timeout: 15_000 });

  await sheet.getByLabel("Purpose").fill(args.purpose);
  await fillBorrowWindow(page);
  await sheet.getByRole("button", { name: "Continue to agreement" }).click();
  await expect(sheet.getByText("Say whether the gear will be used off campus.")).toBeVisible();
  await sheet.getByRole("radio", { name: "No, on campus" }).click();
  await expect(sheet.getByText("Say whether the gear will be used off campus.")).toBeHidden();
  if (args.offCampus) {
    // Radix selects on the focus move, which lands while the key is still held.
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(50);
    await page.keyboard.up("ArrowRight");
    await expect(sheet.getByRole("radio", { name: "Yes, off campus" })).toHaveAttribute("aria-checked", "true");
  }
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
  const bandPurpose = `E2E band borrow ${stamp}`;

  test.beforeAll(() => {
    runConvex("e2eHelpers:seedBorrowableInventoryType", { name: typeName });
    runConvex("e2eHelpers:resetBorrowCourtesyAcceptances", {});
  });

  test.describe("crew", () => {
    test.use({ storageState: crewAuthFile });

    test("crew must tick every term and e-sign before submitting", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/dashboard/inventory/borrow-requests");
      await expect(page.getByRole("heading", { name: "Borrow requests" })).toBeVisible({
        timeout: 25_000,
      });
      // Crew can't review, so they land on their own requests.
      await expect(page.getByTestId("borrow-requests-mine")).toBeVisible({ timeout: 25_000 });

      await submitBorrowRequest(page, {
        purpose: crewPurpose,
        typeName,
        signedName: "Casey Crew",
      });
      await expect(page.getByTestId("borrow-requests-mine").getByText(crewPurpose)).toBeVisible({
        timeout: 20_000,
      });

      const request = await pollConvex<BorrowRequestState>(
        "e2eHelpers:getLatestBorrowRequestByPurpose",
        { purpose: crewPurpose },
        (row) => row?.status === "submitted",
      );
      expect(request.agreementSignedName).toBe("Casey Crew");
      expect(request.agreementTermKeys).toHaveLength(TERM_COUNT);
    });
  });

  test.describe("band", () => {
    test.use({ storageState: bandAuthFile });

    test("an artist borrows gear from their own sidebar entry", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/dashboard");
      await page.getByRole("link", { name: "Borrow gear" }).click();
      await expect(page).toHaveURL(/\/dashboard\/inventory\/borrow-requests/);

      const courtesy = page.getByTestId("borrow-courtesy-dialog");
      await expect(courtesy).toBeVisible({ timeout: 25_000 });
      const agree = courtesy.getByRole("button", { name: "I agree" });
      await expect(agree).toBeDisabled();
      await courtesy.getByRole("checkbox").first().click();
      await expect(agree).toBeDisabled();
      await courtesy.getByRole("checkbox").nth(1).click();
      await agree.click();
      await expect(courtesy).toBeHidden({ timeout: 15_000 });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Borrow requests" })).toBeVisible({
        timeout: 25_000,
      });
      await expect(page.getByTestId("borrow-requests-mine")).toBeVisible({ timeout: 25_000 });
      await expect(courtesy).toBeHidden();

      // Artists can't review, so they land on their own requests.
      await expect(page.getByTestId("borrow-requests-mine")).toBeVisible({ timeout: 25_000 });

      await submitBorrowRequest(page, {
        purpose: bandPurpose,
        typeName,
        signedName: "Bailey Band",
        offCampus: true,
      });
      await expect(page.getByTestId("borrow-requests-mine").getByText(bandPurpose)).toBeVisible({
        timeout: 20_000,
      });

      const request = await pollConvex<BorrowRequestState>(
        "e2eHelpers:getLatestBorrowRequestByPurpose",
        { purpose: bandPurpose },
        (row) => row?.status === "submitted",
      );
      expect(request.agreementSignedName).toBe("Bailey Band");
      expect(request.requesterOrganizationName).toBe(e2eEnv.bandOrgName);
      expect(request.usedOffCampus).toBe(true);
    });
  });

  test.describe("admin", () => {
    test.use({ storageState: adminAuthFile });

    test("admin sees the signed agreement and approves", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/dashboard/inventory/borrow-requests");
      // Reviewers land on To review, filtered to pending requests.
      const row = page
        .getByRole("main")
        .getByTestId("borrow-requests-review")
        .locator('[data-testid^="borrow-request-row-"]')
        .filter({ hasText: crewPurpose })
        .first();
      await expect(row).toBeVisible({ timeout: 25_000 });

      await row.getByText(crewPurpose).click();
      const sheet = page.getByTestId("borrow-request-sheet");
      await expect(sheet.getByText(/E-signed by/)).toBeVisible();
      await expect(sheet.getByText(/unsupported equipment loan/)).toBeVisible();
      // The panel is deep-linkable.
      await expect(page).toHaveURL(/[?&]request=/);

      await sheet.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(page.getByText("Borrow request approved.")).toBeVisible({ timeout: 20_000 });
      // The panel closes once the approval succeeds.
      await expect(sheet).toBeHidden();

      const request = await pollConvex<BorrowRequestState>(
        "e2eHelpers:getLatestBorrowRequestByPurpose",
        { purpose: crewPurpose },
        (row) => row?.status === "approved",
      );
      expect(request.convertedEventId).not.toBeNull();
    });

    test("admin sees which act an artist's request is for", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/dashboard/inventory/borrow-requests");
      const row = page
        .getByRole("main")
        .getByTestId("borrow-requests-review")
        .locator('[data-testid^="borrow-request-row-"]')
        .filter({ hasText: bandPurpose })
        .first();
      await expect(row).toBeVisible({ timeout: 25_000 });
      await expect(row).toContainText(e2eEnv.bandOrgName);

      await row.getByText(bandPurpose).click();
      const sheet = page.getByTestId("borrow-request-sheet");
      await expect(sheet.getByText(e2eEnv.bandOrgName)).toBeVisible();
      await expect(sheet.getByText("Off campus")).toBeVisible();
    });
  });
});
