"use node";

import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  buildShowPackage,
  fileStem,
  type ShowBandInput,
} from "@arbor/show-file/node";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

type EventRiderRow = FunctionReturnType<typeof api.bandRiders.listForEvent>[number];

export const downloadByEventId = action({
  args: { eventId: v.id("events") },
  returns: v.object({
    bytes: v.bytes(),
    fileName: v.string(),
  }),
  handler: async (ctx, args): Promise<{ bytes: ArrayBuffer; fileName: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be signed in.");

    const detail = await ctx.runQuery(api.events.get, {
      id: args.eventId,
      detail: "schedule",
    });
    if (!detail?.event) throw new Error("Event not found.");

    const rows: EventRiderRow[] = await ctx.runQuery(api.bandRiders.listForEvent, {
      eventId: args.eventId,
    });

    const bands: ShowBandInput[] = [];
    for (const row of rows) {
      if (!row.rider || row.rider.inputs.length === 0) continue;
      bands.push({
        bandName: row.bandName,
        fileStem: fileStem(row.bandName),
        role: row.role,
        inputs: row.rider.inputs,
      });
    }

    const result = buildShowPackage({
      eventName: detail.event.title,
      bands,
    });

    const bytes = new ArrayBuffer(result.zipBytes.byteLength);
    new Uint8Array(bytes).set(result.zipBytes);

    return {
      bytes,
      fileName: result.fileName,
    };
  },
});
