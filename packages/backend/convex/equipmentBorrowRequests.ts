import { v } from "convex/values";
import {
  BORROW_AGREEMENT_TERM_KEYS,
  BORROW_AGREEMENT_TERMS,
  BORROW_AGREEMENT_VERSION,
  BORROW_COURTESY_TERM_KEYS,
  BORROW_COURTESY_VERSION,
  pacificDateKey,
  PORTAL_TIMEZONE,
} from "@arbor/format";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  getUserId,
  isStaffAdmin,
  requireActiveOrganizationContext,
  requireAdmin,
  requireArborInternalContext,
  requireAuth,
  type ActiveOrganizationContext,
} from "./lib/auth";
import { isArtistOrganizationType } from "./lib/organizationType";
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

const agreementInput = v.object({
  version: v.string(),
  acceptedTermKeys: v.array(v.string()),
  signedName: v.string(),
});

export const borrowRequestStatusValue = v.union(
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("cancelled"),
);

/**
 * Arbor staff and artists (bands / DJs) can both ask to borrow gear and follow
 * their own requests. Reviewing stays Arbor-internal and admin-only.
 */
async function requireBorrowerContext(ctx: QueryCtx | MutationCtx): Promise<ActiveOrganizationContext> {
  const context = await requireActiveOrganizationContext(ctx);
  if (context.organizationType !== "arbor_internal" && !isArtistOrganizationType(context.organizationType)) {
    throw new Error("Borrow requests aren't available in this organization.");
  }
  return context;
}

async function hasAcceptedCourtesy(ctx: QueryCtx | MutationCtx, userId: string) {
  const row = await ctx.db
    .query("borrowCourtesyAcceptances")
    .withIndex("by_userId_and_version", (q) => q.eq("userId", userId).eq("version", BORROW_COURTESY_VERSION))
    .first();
  return row !== null;
}

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
  const requester = request.requesterOrganizationName
    ? `${request.requesterName} (${request.requesterOrganizationName})`
    : request.requesterName;
  const parts = [`Borrow request ${request.requestNumber} from ${requester}.`];
  if (request.agreement) {
    parts.push(
      `Loan agreement e-signed by ${request.agreement.signedName} (${request.agreement.signedEmail}) — no Arbor Live support; borrower is fully liable for the equipment.`,
    );
  }
  if (request.usedOffCampus) parts.push("The gear will be used off campus.");
  if (request.notes?.trim()) parts.push(request.notes.trim());
  return parts.join("\n");
}

export const submit = mutation({
  args: {
    purpose: v.string(),
    venueId: v.optional(v.id("venues")),
    usedOffCampus: v.boolean(),
    notes: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.number(),
    lines: v.array(borrowLineInput),
    agreement: agreementInput,
  },
  returns: v.object({
    id: v.id("equipmentBorrowRequests"),
    requestNumber: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const context = await requireBorrowerContext(ctx);
    if (context.isAdminPreview) {
      throw new Error("Switch back to Arbor Live to request gear; you're previewing this artist.");
    }
    const artistOrganization = isArtistOrganizationType(context.organizationType) ? context : null;
    if (artistOrganization && !(await hasAcceptedCourtesy(ctx, getUserId(user)))) {
      throw new Error("Agree to the borrowing courtesy terms before you send a request.");
    }

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

    if (args.agreement.version !== BORROW_AGREEMENT_VERSION) {
      throw new Error("The loan agreement was updated. Reload the page and review it again.");
    }
    const accepted = new Set(args.agreement.acceptedTermKeys);
    if (BORROW_AGREEMENT_TERM_KEYS.some((key) => !accepted.has(key))) {
      throw new Error("Tick every box in the loan agreement before submitting.");
    }
    const signedName = args.agreement.signedName.trim();
    if (signedName.length < 2) throw new Error("Type your full legal name to sign the loan agreement.");

    const venueLink = await resolveVenueLink(ctx, args.venueId);
    const requesterEmail = user.email?.trim().toLowerCase() ?? "";

    const now = Date.now();
    const requestNumber = await allocateBorrowRequestNumber(ctx);
    const id = await ctx.db.insert("equipmentBorrowRequests", {
      status: "submitted",
      requestNumber,
      requesterUserId: getUserId(user),
      requesterName: displayNameForUser(user),
      requesterEmail,
      requesterOrganizationId: artistOrganization?.organizationId,
      requesterOrganizationName: artistOrganization?.organizationName,
      purpose,
      venueId: venueLink.venueId,
      venueName: venueLink.venueName,
      usedOffCampus: args.usedOffCampus,
      notes: args.notes?.trim() || undefined,
      startAt: args.startAt,
      endAt: args.endAt,
      lines,
      agreement: {
        version: BORROW_AGREEMENT_VERSION,
        terms: BORROW_AGREEMENT_TERMS.map((term) => ({ key: term.key, text: term.text })),
        signedName,
        signedEmail: requesterEmail,
        signedByUserId: getUserId(user),
        signedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    const inserted = await ctx.db.get(id);
    if (inserted) await scheduleEquipmentBorrowRequestSubmittedEmail(ctx, inserted);

    return { id, requestNumber };
  },
});

/** Whether the viewer still has to agree to the courtesy terms. Only artists do, once per terms version. */
export const courtesyStatus = query({
  args: {},
  returns: v.object({ mustAccept: v.boolean() }),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const context = await requireBorrowerContext(ctx);
    if (!isArtistOrganizationType(context.organizationType) || context.isAdminPreview) {
      return { mustAccept: false };
    }
    return { mustAccept: !(await hasAcceptedCourtesy(ctx, getUserId(user))) };
  },
});

export const acceptCourtesy = mutation({
  args: { version: v.string(), acceptedTermKeys: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const context = await requireBorrowerContext(ctx);
    if (!isArtistOrganizationType(context.organizationType) || context.isAdminPreview) {
      throw new Error("Only artists agree to the borrowing courtesy terms.");
    }
    if (args.version !== BORROW_COURTESY_VERSION) {
      throw new Error("The borrowing terms were updated. Reload the page and review them again.");
    }
    const accepted = new Set(args.acceptedTermKeys);
    if (BORROW_COURTESY_TERM_KEYS.some((key) => !accepted.has(key))) {
      throw new Error("Tick both boxes to agree.");
    }
    const userId = getUserId(user);
    if (await hasAcceptedCourtesy(ctx, userId)) return null;
    await ctx.db.insert("borrowCourtesyAcceptances", {
      userId,
      version: BORROW_COURTESY_VERSION,
      organizationId: context.organizationId,
      acceptedAt: Date.now(),
    });
    return null;
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    await requireBorrowerContext(ctx);
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

/**
 * One request for the detail panel (`?request=<id>` deep links). Admins can
 * open any request; everyone else only their own. Null when the id is
 * malformed, the request is gone, or it isn't the viewer's to see. Takes a
 * plain string because the id comes straight from the URL.
 */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireBorrowerContext(ctx);
    const id = ctx.db.normalizeId("equipmentBorrowRequests", args.id);
    if (!id) return null;
    const request = await ctx.db.get(id);
    if (!request) return null;
    const isMine = request.requesterUserId === getUserId(user);
    if (!isMine && !(await isStaffAdmin(ctx, user))) return null;
    return { request, isMine };
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
    await requireBorrowerContext(ctx);
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
