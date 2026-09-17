import { v } from "convex/values";
import { pacificDateKey, PORTAL_TIMEZONE } from "@arbor/format";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getUserId, requireAdmin, requireArborInternalContext, requireAuth } from "./lib/auth";
import { insertPullListItemsFromLines } from "./eventPullLists";
import { allocateBorrowRequestNumber } from "./lib/publicReferenceIds";
import { resolveVenueLink } from "./lib/venues";
import {
  scheduleEquipmentBorrowRequestDecidedEmail,
  scheduleEquipmentBorrowRequestSubmittedEmail,
} from "./email/equipmentBorrowRequestEmails";

const MAX_LINES = 40;
const MAX_LINE_QUANTITY = 999;
/** Borrow requests are low-volume; one page covers a review queue and a member's history. */
const LIST_TAKE = 200;

const borrowLineKindValue = v.union(v.literal("type"), v.literal("package"));

const borrowLineInput = v.object({
  lineKind: borrowLineKindValue,
  typeId: v.optional(v.id("inventoryTypes")),
  packageId: v.optional(v.id("inventoryPackages")),
  quantity: v.number(),
});

export const borrowRequestStatusValue = v.union(
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("cancelled"),
);

type ResolvedLine = Doc<"equipmentBorrowRequests">["lines"][number];

function displayNameForUser(user: { name?: string | null; email?: string | null }) {
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) return email;
  return "Crew member";
}

/**
 * Canonicalize a requested line: verify the referenced catalog row still
 * exists and freeze its display label onto the request.
 */
async function resolveLine(
  ctx: QueryCtx | MutationCtx,
  line: { lineKind: "type" | "package"; typeId?: Id<"inventoryTypes">; packageId?: Id<"inventoryPackages">; quantity: number },
): Promise<ResolvedLine> {
  const quantity = Math.floor(line.quantity);
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error("Each equipment line needs a quantity of at least 1.");
  }
  if (quantity > MAX_LINE_QUANTITY) {
    throw new Error(`Quantity must be ${MAX_LINE_QUANTITY} or less per line.`);
  }
  if (line.lineKind === "package") {
    if (!line.packageId) throw new Error("Package lines require a package.");
    const pkg = await ctx.db.get(line.packageId);
    if (!pkg) throw new Error("Inventory package not found.");
    return {
      lineKind: "package",
      packageId: line.packageId,
      typeId: undefined,
      label: pkg.name,
      quantity,
    };
  }
  const type = line.typeId ? await ctx.db.get(line.typeId) : null;
  if (!type) throw new Error("Inventory type not found.");
  return {
    lineKind: "type",
    typeId: type._id,
    packageId: undefined,
    label: type.name,
    quantity,
  };
}

function buildEventNotes(request: Doc<"equipmentBorrowRequests">) {
  const parts = [`Borrow request ${request.requestNumber} from ${request.requesterName}.`];
  if (request.notes?.trim()) parts.push(request.notes.trim());
  return parts.join("\n");
}

export const submit = mutation({
  args: {
    purpose: v.string(),
    venueId: v.optional(v.id("venues")),
    notes: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.number(),
    lines: v.array(borrowLineInput),
  },
  returns: v.object({
    id: v.id("equipmentBorrowRequests"),
    requestNumber: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);

    const purpose = args.purpose.trim();
    if (!purpose) throw new Error("Add a short purpose for the borrow.");
    if (args.endAt <= args.startAt) {
      throw new Error("Return time must be after the pickup time.");
    }
    if (args.lines.length === 0) throw new Error("Add at least one piece of equipment.");
    if (args.lines.length > MAX_LINES) {
      throw new Error(`Too many lines (max ${MAX_LINES}).`);
    }

    const lines: ResolvedLine[] = [];
    for (const line of args.lines) {
      lines.push(await resolveLine(ctx, line));
    }

    const venueLink = await resolveVenueLink(ctx, args.venueId);

    const now = Date.now();
    const requestNumber = await allocateBorrowRequestNumber(ctx);
    const id = await ctx.db.insert("equipmentBorrowRequests", {
      status: "submitted",
      requestNumber,
      requesterUserId: getUserId(user),
      requesterName: displayNameForUser(user),
      requesterEmail: user.email?.trim().toLowerCase() ?? "",
      purpose,
      venueId: venueLink.venueId,
      venueName: venueLink.venueName,
      notes: args.notes?.trim() || undefined,
      startAt: args.startAt,
      endAt: args.endAt,
      lines,
      createdAt: now,
      updatedAt: now,
    });

    const inserted = await ctx.db.get(id);
    if (inserted) await scheduleEquipmentBorrowRequestSubmittedEmail(ctx, inserted);

    return { id, requestNumber };
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const rows = await ctx.db
      .query("equipmentBorrowRequests")
      .withIndex("by_requesterUserId_and_createdAt", (q) => q.eq("requesterUserId", getUserId(user)))
      .order("desc")
      .take(LIST_TAKE);
    return rows;
  },
});

export const list = query({
  args: {
    status: v.optional(borrowRequestStatusValue),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    if (args.status) {
      return await ctx.db
        .query("equipmentBorrowRequests")
        .withIndex("by_status_and_createdAt", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(LIST_TAKE);
    }
    return await ctx.db
      .query("equipmentBorrowRequests")
      .withIndex("by_createdAt")
      .order("desc")
      .take(LIST_TAKE);
  },
});

export const approve = mutation({
  args: {
    id: v.id("equipmentBorrowRequests"),
    reviewNote: v.optional(v.string()),
  },
  returns: v.object({ eventId: v.id("events") }),
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Borrow request not found.");
    if (request.status !== "submitted") {
      throw new Error("Only submitted requests can be approved.");
    }

    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      title: request.purpose,
      status: "logistics",
      visibility: "internal",
      startAt: request.startAt,
      endAt: request.endAt,
      timezone: PORTAL_TIMEZONE,
      spansMultipleDays: pacificDateKey(request.startAt) !== pacificDateKey(request.endAt),
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      venueId: request.venueId,
      venueName: request.venueName,
      eventType: "Dry Rental",
      teamsInterested: ["Operations"],
      rentalFulfillmentMode: "will_call",
      notes: buildEventNotes(request),
      createdAt: now,
      updatedAt: now,
    });

    await insertPullListItemsFromLines(
      ctx,
      eventId,
      request.lines.map((line) => ({
        lineKind: line.lineKind,
        typeId: line.typeId,
        packageId: line.packageId,
        label: line.label,
        quantity: line.quantity,
      })),
    );

    await ctx.db.patch(args.id, {
      status: "approved",
      reviewedByUserId: getUserId(user),
      reviewedByUserName: displayNameForUser(user),
      reviewedAt: now,
      reviewNote: args.reviewNote?.trim() || undefined,
      convertedEventId: eventId,
      updatedAt: now,
    });

    await scheduleEquipmentBorrowRequestDecidedEmail(ctx, {
      request,
      approved: true,
      reviewNote: args.reviewNote?.trim() || undefined,
    });

    return { eventId };
  },
});

export const reject = mutation({
  args: {
    id: v.id("equipmentBorrowRequests"),
    reviewNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Borrow request not found.");
    if (request.status !== "submitted") {
      throw new Error("Only submitted requests can be rejected.");
    }

    const now = Date.now();
    const reviewNote = args.reviewNote?.trim() || undefined;
    await ctx.db.patch(args.id, {
      status: "rejected",
      reviewedByUserId: getUserId(user),
      reviewedByUserName: displayNameForUser(user),
      reviewedAt: now,
      reviewNote,
      updatedAt: now,
    });

    await scheduleEquipmentBorrowRequestDecidedEmail(ctx, {
      request,
      approved: false,
      reviewNote,
    });

    return null;
  },
});

export const cancel = mutation({
  args: { id: v.id("equipmentBorrowRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Borrow request not found.");
    if (request.requesterUserId !== getUserId(user)) {
      throw new Error("You can only cancel your own borrow requests.");
    }
    if (request.status !== "submitted") {
      throw new Error("Only submitted requests can be cancelled.");
    }
    await ctx.db.patch(args.id, { status: "cancelled", updatedAt: Date.now() });
    return null;
  },
});
