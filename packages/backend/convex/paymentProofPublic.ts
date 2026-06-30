"use node";

import { v } from "convex/values";
import { renderInvoicePdfBuffer } from "@arbor/invoice-document/pdf";
import type { InvoiceDocumentData } from "@arbor/invoice-document/types";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

async function loadPublicInvoicePdf(
  ctx: { runQuery: (...args: any[]) => Promise<unknown> },
  token: string,
  portal: "quote" | "request",
) {
  const invoiceId = (await ctx.runQuery(internal.paymentProofInternals.resolvePublicInvoiceId, {
    token,
    portal,
  })) as Id<"invoices"> | null;
  if (!invoiceId) throw new Error("Quote not found.");

  const document = (await ctx.runQuery(internal.email.invoiceEmailData.getInvoiceDocument, {
    invoiceId,
  })) as InvoiceDocumentData | null;
  if (!document) throw new Error("Invoice not found.");

  const buffer = await renderInvoicePdfBuffer(document);
  return new Uint8Array(buffer).buffer as ArrayBuffer;
}

export const downloadInvoicePdfByQuoteToken = action({
  args: { token: v.string() },
  returns: v.bytes(),
  handler: async (ctx, args) => loadPublicInvoicePdf(ctx, args.token, "quote"),
});

export const downloadInvoicePdfByRequestToken = action({
  args: { token: v.string() },
  returns: v.bytes(),
  handler: async (ctx, args) => loadPublicInvoicePdf(ctx, args.token, "request"),
});
