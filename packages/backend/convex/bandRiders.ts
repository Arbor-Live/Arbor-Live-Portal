import { v } from "convex/values";
import { formatDate } from "@arbor/format";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  getActiveOrganizationContextOrNull,
  getUserId,
  isAdmin,
  requireArborInternalContext,
  requireAuth,
  requireBandContext,
} from "./lib/auth";
import { resolveBandName } from "./lib/bandIdentity";
import {
  RIDER_LIMITS,
  riderContentFields,
  riderContentValue,
  riderStatusValue,
} from "./lib/riderSchema";

const riderSummaryValidator = v.object({
  _id: v.id("bandRiders"),
  name: v.string(),
  status: riderStatusValue,
  isDefault: v.boolean(),
  itemCount: v.number(),
  channelCount: v.number(),
  mixCount: v.number(),
  updatedAt: v.number(),
});

const riderValidator = v.object({
  _id: v.id("bandRiders"),
  organizationId: v.string(),
  bandName: v.string(),
  name: v.string(),
  status: riderStatusValue,
  isDefault: v.boolean(),
  ...riderContentFields,
  updatedAt: v.number(),
  canEdit: v.boolean(),
});

const riderDocumentValidator = v.object({
  bandName: v.string(),
  riderName: v.string(),
  updatedAtLabel: v.string(),
  ...riderContentFields,
});

type RiderDoc = Doc<"bandRiders">;

function riderContent(rider: RiderDoc) {
  return {
    stage: rider.stage,
    items: rider.items,
    inputs: rider.inputs,
    monitorMixes: rider.monitorMixes,
    backline: rider.backline,
    performerCount: rider.performerCount,
    setLengthMinutes: rider.setLengthMinutes,
    powerNotes: rider.powerNotes,
    generalNotes: rider.generalNotes,
    hospitalityNotes: rider.hospitalityNotes,
    contactName: rider.contactName,
    contactEmail: rider.contactEmail,
    contactPhone: rider.contactPhone,
  };
}

function summarize(rider: RiderDoc) {
  return {
    _id: rider._id,
    name: rider.name,
    status: rider.status,
    isDefault: rider.isDefault,
    itemCount: rider.items.length,
    channelCount: rider.inputs.length,
    mixCount: rider.monitorMixes.length,
    updatedAt: rider.updatedAt,
  };
}

/**
 * Riders are readable by the owning band and by Arbor crew (they need the plot
 * to build a show file). Band members and portal admins can edit.
 */
async function loadRiderForViewer(
  ctx: QueryCtx | MutationCtx,
  riderId: Id<"bandRiders">,
): Promise<{ rider: RiderDoc; canEdit: boolean }> {
  const user = await requireAuth(ctx);
  const rider = await ctx.db.get(riderId);
  if (!rider) throw new Error("Rider not found.");

  if (isAdmin(user)) {
    return { rider, canEdit: true };
  }

  const context = await getActiveOrganizationContextOrNull(ctx);
  if (!context) throw new Error("You do not have access to this rider.");

  if (context.organizationType === "arbor_internal") {
    return { rider, canEdit: false };
  }
  if (context.organizationId !== rider.organizationId) {
    throw new Error("You do not have access to this rider.");
  }
  return { rider, canEdit: true };
}

async function requireEditableRider(ctx: MutationCtx, riderId: Id<"bandRiders">) {
  const user = await requireAuth(ctx);
  const rider = await ctx.db.get(riderId);
  if (!rider) throw new Error("Rider not found.");

  if (isAdmin(user)) {
    return { rider, organizationId: rider.organizationId };
  }

  const context = await requireBandContext(ctx);
  if (rider.organizationId !== context.organizationId) {
    throw new Error("You do not have access to this rider.");
  }
  return { rider, organizationId: context.organizationId };
}

/** Active band org, or an explicit org id when a portal admin is managing a band. */
async function resolveRiderOrganizationId(
  ctx: QueryCtx | MutationCtx,
  organizationId: string | undefined,
): Promise<string> {
  const user = await requireAuth(ctx);
  if (organizationId) {
    if (!isAdmin(user)) {
      const context = await requireBandContext(ctx);
      if (context.organizationId !== organizationId) {
        throw new Error("You do not have access to this band.");
      }
    }
    return organizationId;
  }
  const context = await requireBandContext(ctx);
  return context.organizationId;
}

function trimmedName(name: string): string {
  const value = name.trim();
  if (!value) throw new Error("Give the rider a name.");
  return value.slice(0, RIDER_LIMITS.maxNameLength);
}

/** Rejects payloads that would break the editor, the PDF, or the show-file job. */
function validateContent(content: {
  stage: { widthFt: number; depthFt: number };
  items: unknown[];
  inputs: unknown[];
  monitorMixes: unknown[];
  backline: unknown[];
}) {
  const { widthFt, depthFt } = content.stage;
  if (
    !Number.isFinite(widthFt) ||
    !Number.isFinite(depthFt) ||
    widthFt < RIDER_LIMITS.minStageFt ||
    depthFt < RIDER_LIMITS.minStageFt ||
    widthFt > RIDER_LIMITS.maxStageFt ||
    depthFt > RIDER_LIMITS.maxStageFt
  ) {
    throw new Error(
      `Stage size must be between ${RIDER_LIMITS.minStageFt} and ${RIDER_LIMITS.maxStageFt} feet.`,
    );
  }
  if (content.items.length > RIDER_LIMITS.maxItems) {
    throw new Error(`A stage plot can hold at most ${RIDER_LIMITS.maxItems} symbols.`);
  }
  if (content.inputs.length > RIDER_LIMITS.maxInputs) {
    throw new Error(`An input list can hold at most ${RIDER_LIMITS.maxInputs} channels.`);
  }
  if (content.monitorMixes.length > RIDER_LIMITS.maxMixes) {
    throw new Error(`A rider can hold at most ${RIDER_LIMITS.maxMixes} monitor mixes.`);
  }
  if (content.backline.length > RIDER_LIMITS.maxBackline) {
    throw new Error(`A rider can hold at most ${RIDER_LIMITS.maxBackline} backline rows.`);
  }
}

async function clearDefaultFlag(
  ctx: MutationCtx,
  organizationId: string,
  exceptRiderId?: Id<"bandRiders">,
) {
  const existing = await ctx.db
    .query("bandRiders")
    .withIndex("by_organizationId_and_isDefault", (q) =>
      q.eq("organizationId", organizationId).eq("isDefault", true),
    )
    .take(RIDER_LIMITS.maxItems);
  for (const rider of existing) {
    if (exceptRiderId && rider._id === exceptRiderId) continue;
    await ctx.db.patch(rider._id, { isDefault: false });
  }
}

export const listForActiveBand = query({
  args: { organizationId: v.optional(v.string()) },
  returns: v.array(riderSummaryValidator),
  handler: async (ctx, args) => {
    const organizationId = await resolveRiderOrganizationId(ctx, args.organizationId);
    const riders = await ctx.db
      .query("bandRiders")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .take(50);
    return riders
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      })
      .map(summarize);
  },
});

export const get = query({
  args: { riderId: v.id("bandRiders") },
  returns: riderValidator,
  handler: async (ctx, args) => {
    const { rider, canEdit } = await loadRiderForViewer(ctx, args.riderId);
    return {
      _id: rider._id,
      organizationId: rider.organizationId,
      bandName: await resolveBandName(ctx, rider.organizationId),
      name: rider.name,
      status: rider.status,
      isDefault: rider.isDefault,
      ...riderContent(rider),
      updatedAt: rider.updatedAt,
      canEdit,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    content: riderContentValue,
    organizationId: v.optional(v.string()),
  },
  returns: v.id("bandRiders"),
  handler: async (ctx, args) => {
    const organizationId = await resolveRiderOrganizationId(ctx, args.organizationId);
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    validateContent(args.content);

    const existing = await ctx.db
      .query("bandRiders")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .take(50);
    if (existing.length >= 25) {
      throw new Error("You already have 25 riders. Delete one before adding another.");
    }

    const isFirst = existing.length === 0;
    if (isFirst) await clearDefaultFlag(ctx, organizationId);

    const now = Date.now();
    return await ctx.db.insert("bandRiders", {
      organizationId,
      name: trimmedName(args.name),
      status: "draft",
      isDefault: isFirst,
      ...args.content,
      createdByUserId: userId,
      updatedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    riderId: v.id("bandRiders"),
    name: v.optional(v.string()),
    status: v.optional(riderStatusValue),
    content: v.optional(riderContentValue),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { rider } = await requireEditableRider(ctx, args.riderId);
    const user = await requireAuth(ctx);
    if (args.content) validateContent(args.content);

    await ctx.db.patch(rider._id, {
      ...(args.name === undefined ? {} : { name: trimmedName(args.name) }),
      ...(args.status === undefined ? {} : { status: args.status }),
      ...(args.content ?? {}),
      updatedByUserId: getUserId(user),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setDefault = mutation({
  args: { riderId: v.id("bandRiders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { rider, organizationId } = await requireEditableRider(ctx, args.riderId);
    await clearDefaultFlag(ctx, organizationId, rider._id);
    await ctx.db.patch(rider._id, { isDefault: true, updatedAt: Date.now() });
    return null;
  },
});

export const duplicate = mutation({
  args: { riderId: v.id("bandRiders"), name: v.optional(v.string()) },
  returns: v.id("bandRiders"),
  handler: async (ctx, args) => {
    const { rider, organizationId } = await requireEditableRider(ctx, args.riderId);
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const now = Date.now();

    return await ctx.db.insert("bandRiders", {
      organizationId,
      name: trimmedName(args.name ?? `${rider.name} (copy)`),
      status: "draft",
      isDefault: false,
      ...riderContent(rider),
      createdByUserId: userId,
      updatedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { riderId: v.id("bandRiders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { rider, organizationId } = await requireEditableRider(ctx, args.riderId);
    await ctx.db.delete(rider._id);

    // Keep exactly one default so show-file generation always has a rider.
    if (rider.isDefault) {
      const remaining = await ctx.db
        .query("bandRiders")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .take(50);
      const next = remaining.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (next) await ctx.db.patch(next._id, { isDefault: true });
    }
    return null;
  },
});

export const getDocumentData = query({
  args: { riderId: v.id("bandRiders") },
  returns: riderDocumentValidator,
  handler: async (ctx, args) => {
    const { rider } = await loadRiderForViewer(ctx, args.riderId);
    return {
      bandName: await resolveBandName(ctx, rider.organizationId),
      riderName: rider.name,
      updatedAtLabel: formatDate(rider.updatedAt),
      ...riderContent(rider),
    };
  },
});

/**
 * Riders for every band on an event — the hand-off point for show-file
 * generation and for crew prepping a patch.
 */
export const listForEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      organizationId: v.string(),
      bandName: v.string(),
      role: v.union(v.literal("headliner"), v.literal("support"), v.literal("other")),
      rider: v.union(
        v.null(),
        v.object({
          _id: v.id("bandRiders"),
          name: v.string(),
          status: riderStatusValue,
          updatedAt: v.number(),
          ...riderContentFields,
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);

    const participations = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(20);

    const rows = [];
    for (const participation of participations) {
      const riders = await ctx.db
        .query("bandRiders")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", participation.organizationId),
        )
        .take(50);
      // Prefer the default rider, then the most recently updated published one.
      const chosen =
        riders.find((rider) => rider.isDefault) ??
        riders
          .filter((rider) => rider.status === "published")
          .sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
        null;

      rows.push({
        organizationId: participation.organizationId,
        bandName: await resolveBandName(ctx, participation.organizationId),
        role: participation.role,
        rider: chosen
          ? {
              _id: chosen._id,
              name: chosen.name,
              status: chosen.status,
              updatedAt: chosen.updatedAt,
              ...riderContent(chosen),
            }
          : null,
      });
    }
    return rows;
  },
});
