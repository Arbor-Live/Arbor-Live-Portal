"use node";

import { v } from "convex/values";
import { renderInvoicePdfBuffer } from "@arbor/invoice-document/pdf";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

export const downloadByInvoiceId = action({
  args: {
    invoiceId: v.id("invoices"),
    siteOrigin: v.optional(v.string()),
  },
  returns: v.bytes(),
  handler: async (ctx, args) => {
    // Local auth guard: getDocumentData enforces the full role check, but this
    // action must not depend solely on a downstream guard.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be signed in.");
    const document = await ctx.runQuery(api.invoices.getDocumentData, {
      id: args.invoiceId,
      siteOrigin: args.siteOrigin,
    });
    if (!document) throw new Error("Invoice not found.");

    const buffer = await renderInvoicePdfBuffer(document);
    await ctx.runMutation(api.invoicePdf.createExportRecord, {
      invoiceId: args.invoiceId,
      fileName: `${document.invoice.invoiceNumber}.pdf`,
    });
    return new Uint8Array(buffer).buffer as ArrayBuffer;
  },
});
