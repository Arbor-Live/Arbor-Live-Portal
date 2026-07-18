import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireAdmin, requireArborInternalContext, requireAuth } from "./lib/auth";
import {
  assertValidVenueType,
  DEFAULT_CIRCUIT_AMPERAGE,
  DEFAULT_CIRCUIT_VOLTAGE,
  type VenueKind,
} from "./lib/venueTypes";
import {
  buildVenuePath,
  isVenueDescendant,
  normalizeNicknames,
  normalizeVenueName,
  resolveInheritedVenueFields,
  syncDenormalizedVenueName,
} from "./lib/venues";

const venueKindValue = v.union(v.literal("building"), v.literal("indoor"), v.literal("outdoor"));

const circuitValue = v.object({
  label: v.string(),
  voltage: v.number(),
  amperage: v.number(),
});

const documentationLinkValue = v.object({
  title: v.string(),
  url: v.string(),
});

const venueFileValue = v.object({
  title: v.string(),
  r2Key: v.string(),
  fileName: v.string(),
  contentType: v.string(),
});

function trimOptional(value: string | undefined) {
  const out = value?.trim();
  return out ? out : undefined;
}

function normalizeCircuits(
  circuits:
    | Array<{ label: string; voltage: number; amperage: number }>
    | undefined,
) {
  if (!circuits) return undefined;
  const cleaned = circuits
    .map((circuit) => ({
      label: circuit.label.trim(),
      voltage: circuit.voltage || DEFAULT_CIRCUIT_VOLTAGE,
      amperage: circuit.amperage || DEFAULT_CIRCUIT_AMPERAGE,
    }))
    .filter((circuit) => circuit.label.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeLinks(links: Array<{ title: string; url: string }> | undefined) {
  if (!links) return undefined;
  const cleaned = links
    .map((link) => ({
      title: link.title.trim() || "Link",
      url: link.url.trim(),
    }))
    .filter((link) => link.url.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeFiles(
  files:
    | Array<{ title: string; r2Key: string; fileName: string; contentType: string }>
    | undefined,
) {
  if (!files) return undefined;
  const cleaned = files
    .map((file) => ({
      title: file.title.trim() || file.fileName.trim() || "File",
      r2Key: file.r2Key.trim(),
      fileName: file.fileName.trim(),
      contentType: file.contentType.trim() || "application/octet-stream",
    }))
    .filter((file) => file.r2Key.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

const venueFieldsArgs = {
  name: v.string(),
  nicknames: v.optional(v.array(v.string())),
  parentId: v.optional(v.id("venues")),
  kind: venueKindValue,
  venueType: v.string(),
  capacity: v.optional(v.number()),
  address: v.optional(v.string()),
  googleMapsUrl: v.optional(v.string()),
  notesJson: v.optional(v.string()),
  circuits: v.optional(v.array(circuitValue)),
  documentationLinks: v.optional(v.array(documentationLinkValue)),
  files: v.optional(v.array(venueFileValue)),
  contactName: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
};

async function requireAdminVenueAccess(ctx: MutationCtx) {
  await requireAdmin(ctx);
  await requireArborInternalContext(ctx);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const venues = await ctx.db.query("venues").withIndex("by_path").collect();
    return venues.sort((a, b) => a.path.localeCompare(b.path));
  },
});

export const get = query({
  args: { id: v.id("venues") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await ctx.db.get(args.id);
  },
});

/** Full venue details for event page sheet (arbor staff, including crew). */
export const getDetails = query({
  args: { id: v.id("venues") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const venue = await ctx.db.get(args.id);
    if (!venue) return null;

    const inherited = await resolveInheritedVenueFields(ctx, venue.parentId);
    const ownContact = Boolean(
      venue.contactName?.trim() || venue.contactEmail?.trim() || venue.contactPhone?.trim(),
    );
    const address = venue.address?.trim()
      ? { value: venue.address, sourcePath: venue.path, inherited: false as const }
      : inherited.address
        ? {
            value: inherited.address.value,
            sourcePath: inherited.address.source.path,
            inherited: true as const,
          }
        : null;
    const googleMapsUrl = venue.googleMapsUrl?.trim()
      ? { value: venue.googleMapsUrl, sourcePath: venue.path, inherited: false as const }
      : inherited.googleMapsUrl
        ? {
            value: inherited.googleMapsUrl.value,
            sourcePath: inherited.googleMapsUrl.source.path,
            inherited: true as const,
          }
        : null;

    const contacts = [
      ...(inherited.contact
        ? [
            {
              contactName: inherited.contact.contactName,
              contactEmail: inherited.contact.contactEmail,
              contactPhone: inherited.contact.contactPhone,
              sourcePath: inherited.contact.source.path,
              inherited: true as const,
            },
          ]
        : []),
      ...(ownContact
        ? [
            {
              contactName: venue.contactName,
              contactEmail: venue.contactEmail,
              contactPhone: venue.contactPhone,
              sourcePath: venue.path,
              inherited: false as const,
            },
          ]
        : []),
    ];

    const documentationLinks = [
      ...inherited.documentationLinks.map((link) => ({
        title: link.title,
        url: link.url,
        sourcePath: link.source.path,
        inherited: true as const,
      })),
      ...(venue.documentationLinks ?? []).map((link) => ({
        ...link,
        sourcePath: venue.path,
        inherited: false as const,
      })),
    ];

    const files = [
      ...inherited.files.map((file) => ({
        title: file.title,
        r2Key: file.r2Key,
        fileName: file.fileName,
        contentType: file.contentType,
        sourcePath: file.source.path,
        inherited: true as const,
      })),
      ...(venue.files ?? []).map((file) => ({
        ...file,
        sourcePath: venue.path,
        inherited: false as const,
      })),
    ];

    return {
      _id: venue._id,
      name: venue.name,
      path: venue.path,
      kind: venue.kind,
      venueType: venue.venueType,
      nicknames: venue.nicknames ?? [],
      capacity: venue.capacity,
      /** Effective address (own, else nearest ancestor). */
      address: address?.value,
      addressMeta: address,
      googleMapsUrl: googleMapsUrl?.value,
      googleMapsUrlMeta: googleMapsUrl,
      notesJson: venue.notesJson,
      circuits: venue.circuits ?? [],
      contacts,
      documentationLinks,
      files,
      /** Own-only contact fields (edit surfaces). */
      contactName: venue.contactName,
      contactEmail: venue.contactEmail,
      contactPhone: venue.contactPhone,
      parentId: venue.parentId,
    };
  },
});

/** Limited fields for pickers (staff + public booking). */
export const listForPicker = query({
  args: {},
  handler: async (ctx) => {
    const venues = await ctx.db.query("venues").withIndex("by_path").collect();
    return venues
      .map((venue) => ({
        _id: venue._id,
        name: venue.name,
        path: venue.path,
        kind: venue.kind,
        venueType: venue.venueType,
        nicknames: venue.nicknames ?? [],
        address: venue.address,
        googleMapsUrl: venue.googleMapsUrl,
        parentId: venue.parentId,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  },
});

export const create = mutation({
  args: venueFieldsArgs,
  handler: async (ctx, args) => {
    await requireAdminVenueAccess(ctx);
    const name = normalizeVenueName(args.name);
    if (!name) throw new Error("Venue name is required.");
    const kind = args.kind as VenueKind;
    assertValidVenueType(kind, args.venueType.trim());

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("Parent venue not found.");
    }

    const path = await buildVenuePath(ctx, name, args.parentId);
    const now = Date.now();

    return await ctx.db.insert("venues", {
      name,
      nicknames: normalizeNicknames(args.nicknames),
      parentId: args.parentId,
      path,
      kind,
      venueType: args.venueType.trim(),
      capacity: args.capacity,
      address: trimOptional(args.address),
      googleMapsUrl: trimOptional(args.googleMapsUrl),
      notesJson: trimOptional(args.notesJson),
      circuits: normalizeCircuits(args.circuits),
      documentationLinks: normalizeLinks(args.documentationLinks),
      files: normalizeFiles(args.files),
      contactName: trimOptional(args.contactName),
      contactEmail: trimOptional(args.contactEmail),
      contactPhone: trimOptional(args.contactPhone),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("venues"),
    ...venueFieldsArgs,
    parentId: v.optional(v.union(v.id("venues"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAdminVenueAccess(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Venue not found.");

    const name = normalizeVenueName(args.name);
    if (!name) throw new Error("Venue name is required.");
    const kind = args.kind as VenueKind;
    assertValidVenueType(kind, args.venueType.trim());

    const parentId =
      args.parentId === null ? undefined : (args.parentId ?? existing.parentId);

    if (parentId === args.id) {
      throw new Error("Venue cannot be its own parent.");
    }
    if (parentId && (await isVenueDescendant(ctx, parentId, args.id))) {
      throw new Error("Cannot move venue under one of its descendants.");
    }

    const path = await buildVenuePath(ctx, name, parentId);
    const now = Date.now();

    await ctx.db.patch(args.id, {
      name,
      nicknames: normalizeNicknames(args.nicknames),
      parentId,
      path,
      kind,
      venueType: args.venueType.trim(),
      capacity: args.capacity,
      address: trimOptional(args.address),
      googleMapsUrl: trimOptional(args.googleMapsUrl),
      notesJson: trimOptional(args.notesJson),
      circuits: normalizeCircuits(args.circuits),
      documentationLinks: normalizeLinks(args.documentationLinks),
      files: normalizeFiles(args.files),
      contactName: trimOptional(args.contactName),
      contactEmail: trimOptional(args.contactEmail),
      contactPhone: trimOptional(args.contactPhone),
      updatedAt: now,
    });

    const oldPrefix = existing.path;
    if (oldPrefix !== path) {
      const allVenues = await ctx.db.query("venues").withIndex("by_path").collect();
      for (const descendant of allVenues) {
        if (descendant._id === args.id) continue;
        if (!descendant.path.startsWith(`${oldPrefix} > `)) continue;
        const nextPath = descendant.path.replace(oldPrefix, path);
        await ctx.db.patch(descendant._id, {
          path: nextPath,
          updatedAt: now,
        });
        await syncDenormalizedVenueName(ctx, descendant._id, nextPath);
      }
      await syncDenormalizedVenueName(ctx, args.id, path);
    } else if (existing.name !== name) {
      await syncDenormalizedVenueName(ctx, args.id, path);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("venues") },
  handler: async (ctx, args) => {
    await requireAdminVenueAccess(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Venue not found.");

    const child = await ctx.db
      .query("venues")
      .withIndex("by_parentId", (q) => q.eq("parentId", args.id))
      .first();
    if (child) {
      throw new Error("Cannot delete venue with child venues. Re-parent or delete children first.");
    }

    const linkedEvent = await ctx.db
      .query("events")
      .withIndex("by_venueId", (q) => q.eq("venueId", args.id))
      .first();
    if (linkedEvent) {
      throw new Error("Cannot delete venue used by events. Clear venue on those events first.");
    }

    const linkedSeries = await ctx.db
      .query("eventSeries")
      .withIndex("by_venueId", (q) => q.eq("venueId", args.id))
      .first();
    if (linkedSeries) {
      throw new Error("Cannot delete venue used by event series.");
    }

    await ctx.db.delete(args.id);
  },
});

/** Compact create used by the venue picker dialog. */
export const createQuick = mutation({
  args: {
    name: v.string(),
    nicknames: v.optional(v.array(v.string())),
    parentId: v.optional(v.id("venues")),
    kind: venueKindValue,
    venueType: v.string(),
  },
  returns: v.id("venues"),
  handler: async (ctx, args) => {
    await requireAdminVenueAccess(ctx);
    const name = normalizeVenueName(args.name);
    if (!name) throw new Error("Venue name is required.");
    const kind = args.kind as VenueKind;
    assertValidVenueType(kind, args.venueType.trim());

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("Parent venue not found.");
    }

    const path = await buildVenuePath(ctx, name, args.parentId);
    const now = Date.now();
    return await ctx.db.insert("venues", {
      name,
      nicknames: normalizeNicknames(args.nicknames),
      parentId: args.parentId,
      path,
      kind,
      venueType: args.venueType.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});
