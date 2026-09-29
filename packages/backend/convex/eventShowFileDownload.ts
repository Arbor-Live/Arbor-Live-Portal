"use node";

import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  buildShowPackage,
  fileStem,
  type PatchPlan,
  type ShowBandInput,
  type ShowTarget,
} from "@arbor/show-file/node";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

type EventRiderRow = FunctionReturnType<typeof api.bandRiders.listForEvent>[number];

const targetValidator = v.optional(
  v.union(v.literal("wing"), v.literal("x32"), v.literal("xair")),
);

const previewRowValidator = v.object({
  span: v.string(),
  name: v.string(),
  patch: v.string(),
  stereo: v.boolean(),
  phantom: v.boolean(),
  bands: v.array(v.string()),
});

/** Riders with inputs, in show order, as the show-file builders consume them. */
function bandsFromRows(rows: EventRiderRow[]): ShowBandInput[] {
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
  return bands;
}

export const downloadByEventId = action({
  args: {
    eventId: v.id("events"),
    /** Desk to build for. Defaults to the WING. */
    target: targetValidator,
  },
  returns: v.object({
    bytes: v.bytes(),
    fileName: v.string(),
    warnings: v.array(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ bytes: ArrayBuffer; fileName: string; warnings: string[] }> => {
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
    const bands = bandsFromRows(rows);

    const plan: PatchPlan | null = await ctx.runQuery(api.eventPatchPlan.get, {
      eventId: args.eventId,
    });

    const result = buildShowPackage({
      eventName: detail.event.title,
      bands,
      plan: plan ?? undefined,
      target: args.target as ShowTarget | undefined,
    });

    const bytes = new ArrayBuffer(result.zipBytes.byteLength);
    new Uint8Array(bytes).set(result.zipBytes);

    return {
      bytes,
      fileName: result.fileName,
      warnings: result.warnings,
    };
  },
});

/**
 * The same build as the download, without the archive: warnings plus a
 * channel-by-channel view, so the crew can read the report before downloading.
 */
export const previewByEventId = action({
  args: {
    eventId: v.id("events"),
    target: targetValidator,
  },
  returns: v.object({
    target: v.union(v.literal("wing"), v.literal("x32"), v.literal("xair")),
    warnings: v.array(v.string()),
    scenes: v.array(v.string()),
    preview: v.array(previewRowValidator),
  }),
  handler: async (ctx, args) => {
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
    const bands = bandsFromRows(rows);

    const plan: PatchPlan | null = await ctx.runQuery(api.eventPatchPlan.get, {
      eventId: args.eventId,
    });

    const result = buildShowPackage({
      eventName: detail.event.title,
      bands,
      plan: plan ?? undefined,
      target: args.target as ShowTarget | undefined,
      archive: false,
    });

    return {
      target: result.target,
      warnings: result.warnings,
      scenes: result.sceneNames,
      preview: result.preview,
    };
  },
});
