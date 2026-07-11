"use node";

import { v } from "convex/values";
import { renderInvoicePdfBuffer } from "@arbor/invoice-document/pdf";
import type { InvoiceDocumentData } from "@arbor/invoice-document/types";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { HOUR_MS } from "./rateLimit";

async function loadPublicInvoicePdf(
  ctx: ActionCtx,
  token: string,
  portal: "quote" | "request",
) {
  // Rendering a PDF is CPU-heavy, so throttle these unauthenticated endpoints
  // before doing any work. Per-token caps a single link; the global key bounds
  // total render load.
  await ctx.runMutation(internal.rateLimit.enforce, {
    key: `pdf:${portal}:${token}`,
    limit: 20,
    windowMs: HOUR_MS,
  });
  await ctx.runMutation(internal.rateLimit.enforce, {
    key: "pdf:global",
    limit: 120,
    windowMs: HOUR_MS,
  });

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
