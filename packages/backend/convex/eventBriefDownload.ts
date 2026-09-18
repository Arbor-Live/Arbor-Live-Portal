"use node";

import { v } from "convex/values";
import { fileStem } from "@arbor/show-file";
import { renderEventBriefPdfBuffer } from "@arbor/rider-document/brief";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";

/** Always-available event brief PDF (band input/changeover pages when present). */
export const downloadBriefByEventId = action({
  args: { eventId: v.id("events") },
  returns: v.object({
    bytes: v.bytes(),
    fileName: v.string(),
  }),
  handler: async (ctx, args): Promise<{ bytes: ArrayBuffer; fileName: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be signed in.");
    await ctx.runQuery(api.eventBrief.checkAccess, {});

    const brief = await ctx.runQuery(internal.eventBrief.getBriefSource, {
      eventId: args.eventId,
    });
    if (!brief) throw new Error("Event not found.");

    const buffer = await renderEventBriefPdfBuffer(brief);
    const bytes = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(bytes).set(new Uint8Array(buffer));

    return {
      bytes,
      fileName: `${fileStem(brief.title)}-brief.pdf`,
    };
  },
});
