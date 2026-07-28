import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { buildInvoiceDocumentData } from "../lib/invoiceDocumentBuild";

const invoiceDocumentValidator = v.object({
  invoice: v.object({
    invoiceNumber: v.string(),
    issueDate: v.string(),
    dueDate: v.optional(v.string()),
    managerName: v.string(),
    managerEmail: v.optional(v.string()),
    clientGroupName: v.optional(v.string()),
    clientContactName: v.optional(v.string()),
    clientEmail: v.optional(v.string()),
    clientPhone: v.optional(v.string()),
    clientApprovalStatus: v.optional(v.string()),
    digitalQuoteUrl: v.optional(v.string()),
    equipmentSubtotalUsd: v.number(),
    externalRentalsSubtotalUsd: v.number(),
    artistsSubtotalUsd: v.number(),
    crewSubtotalUsd: v.number(),
    feesSubtotalUsd: v.number(),
    subtotalUsd: v.number(),
    discountAmountUsd: v.number(),
    totalUsd: v.number(),
    notes: v.optional(v.string()),
  }),
  lineItems: v.array(
    v.object({
      id: v.string(),
      section: v.string(),
      provider: v.optional(v.string()),
      label: v.string(),
      detailNote: v.optional(v.string()),
      quantity: v.number(),
      quantityDetail: v.optional(v.string()),
      rateUsd: v.number(),
      amountUsd: v.number(),
    }),
  ),
});

export const getInvoiceDocument = internalQuery({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(invoiceDocumentValidator, v.null()),
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.status === "void") return null;
    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", args.invoiceId))
      .take(500);
    return await buildInvoiceDocumentData(ctx, invoice, lineItems);
  },
});
