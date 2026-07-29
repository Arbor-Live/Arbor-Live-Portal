"use node";

import { v } from "convex/values";
import type { RiderDocumentData } from "@arbor/rider-document";
import { renderRiderPdfBuffer } from "@arbor/rider-document/pdf";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

/** Slugs a band/rider name into something safe for a download filename. */
function fileSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "rider";
}

export const downloadByRiderId = action({
  args: { riderId: v.id("bandRiders") },
  returns: v.object({
    bytes: v.bytes(),
    fileName: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be signed in.");

    const document: RiderDocumentData = await ctx.runQuery(
      api.bandRiders.getDocumentData,
      { riderId: args.riderId },
    );

    const buffer = await renderRiderPdfBuffer(document);
    return {
      bytes: new Uint8Array(buffer).buffer as ArrayBuffer,
      fileName: `${fileSlug(document.bandName)}-technical-rider.pdf`,
    };
  },
});
