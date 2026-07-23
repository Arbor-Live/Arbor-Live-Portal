"use node";

import { v } from "convex/values";
import type { BandPaymentAgreementDocumentData } from "@arbor/invoice-document";
import { renderBandPaymentAgreementPdfBuffer } from "@arbor/invoice-document/pdf";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

export const downloadByPaymentId = action({
  args: {
    paymentId: v.id("eventBandPayments"),
  },
  returns: v.object({
    bytes: v.bytes(),
    fileName: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be signed in.");

    const document: BandPaymentAgreementDocumentData = await ctx.runQuery(
      api.bandPayments.getAgreementDocumentData,
      { paymentId: args.paymentId },
    );

    const buffer = await renderBandPaymentAgreementPdfBuffer(document);
    return {
      bytes: new Uint8Array(buffer).buffer as ArrayBuffer,
      fileName: `${document.confirmationToken}.pdf`,
    };
  },
});
