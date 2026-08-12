"use node";

import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { renderRiderPdfBuffer } from "@arbor/rider-document/pdf";
import {
  allocateEventPatch,
  buildNightRiderDocument,
  fileStem,
  type ShowBandInput,
} from "@arbor/show-file/node";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

function fileSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "event";
}

type EventRiderRow = FunctionReturnType<typeof api.bandRiders.listForEvent>[number];

export const downloadNightRiderByEventId = action({
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
        stage: row.rider.stage,
        items: row.rider.items,
        monitorMixes: row.rider.monitorMixes,
        backline: row.rider.backline,
      });
    }

    if (bands.length === 0) {
      throw new Error(
        "No band riders with inputs on this event. Add performers and a default/published rider first.",
      );
    }

    const allocation = allocateEventPatch(bands);
    const document = buildNightRiderDocument({
      eventName: detail.event.title,
      allocation,
      bands,
    });

    const buffer = await renderRiderPdfBuffer(document);
    const bytes = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(bytes).set(new Uint8Array(buffer));

    return {
      bytes,
      fileName: `${fileSlug(detail.event.title)}-night-rider.pdf`,
    };
  },
});
