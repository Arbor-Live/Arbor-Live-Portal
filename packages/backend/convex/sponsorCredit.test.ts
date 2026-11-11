// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isDiscountTermsLabel } from "./lib/publicQuoteView";
import { makeTest, type Test } from "./test/setup.helpers";

const TOKEN = "quote-token-sponsor-credit";

async function seedQuoteWithTerms(t: Test, labels: string[]) {
  const now = Date.now();
  return await t.run(async (ctx) => {
    const termsIds: Id<"invoiceTerms">[] = [];
    for (const label of labels) {
      termsIds.push(
        await ctx.db.insert("invoiceTerms", {
          label,
          version: "v1",
          markdown: `${label} text`,
          active: true,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    return await ctx.db.insert("invoices", {
      invoiceNumber: "ALINV-SPONSOR",
      status: "finalized",
      issueDate: "2026-10-01",
      managerUserId: "manager",
      managerName: "Alex Manager",
      equipmentPricingMode: "subsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 0,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 0,
      totalUsd: 0,
      clientApprovalStatus: "pending",
      publicApprovalToken: TOKEN,
      termsIds,
      createdAt: now,
      updatedAt: now,
    });
  });
}

test("isDiscountTermsLabel matches the Discount Terms template, any case or version", () => {
  expect(isDiscountTermsLabel("Discount Terms")).toBe(true);
  expect(isDiscountTermsLabel("discount terms (2027)")).toBe(true);
  expect(isDiscountTermsLabel("Standard Terms")).toBe(false);
  expect(isDiscountTermsLabel("Discounted rentals")).toBe(false);
});

test("a quote with Discount Terms ticked asks the client to credit Arbor Live", async () => {
  const t = makeTest();
  await seedQuoteWithTerms(t, ["Standard Terms", "Discount Terms"]);
  const view = await t.query(api.invoices.getPublicQuoteByToken, { token: TOKEN });
  expect(view?.invoice.requiresSponsorCredit).toBe(true);
});

test("a quote without Discount Terms does not", async () => {
  const t = makeTest();
  await seedQuoteWithTerms(t, ["Standard Terms"]);
  const view = await t.query(api.invoices.getPublicQuoteByToken, { token: TOKEN });
  expect(view?.invoice.requiresSponsorCredit).toBe(false);
});
