import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import {
  getActiveOrganizationContextOrNull,
  getCurrentUserOrNull,
  getUserId,
  hasOperationsAccess,
  isStaffAdmin,
  type AuthUser,
} from "./lib/auth";
import { fetchAllBetterAuthRows } from "./lib/betterAuthRows";
import { eventStatusValue, normalizeEventStatus } from "./lib/eventStatus";
import { matchArtists, type SearchOrganizationRow } from "./lib/globalSearch";
import type { ArtistOrganizationType } from "./lib/organizationType";

/**
 * The dashboard's ⌘K palette. One query for every section, so a keystroke is
 * one subscription; each section is gated on the viewer's real access and on
 * the client's flags (an admin in crew mode asks for less than they could see).
 */

const MIN_GLOBAL_SEARCH_CHARS = 2;
const EVENT_LIMIT = 8;
const INVOICE_LIMIT = 6;
const PEOPLE_LIMIT = 6;
const ARTIST_LIMIT = 6;
const MAX_QUERY_LENGTH = 100;
/** Convex full-text search rejects more terms than this. */
const MAX_SEARCH_TERMS = 16;

const ARTIST_TYPES: ArtistOrganizationType[] = ["band", "dj", "singer_songwriter", "other"];
const ARTIST_PROFILE_SCAN_LIMIT = 1_000;

const eventResultValue = v.object({
  _id: v.id("events"),
  title: v.string(),
  startAt: v.number(),
  venueName: v.optional(v.string()),
  status: eventStatusValue,
});

const invoiceResultValue = v.object({
  _id: v.id("invoices"),
  invoiceNumber: v.string(),
  clientGroupName: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("finalized"), v.literal("void")),
});

const personResultValue = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.optional(v.string()),
});

const artistResultValue = v.object({
  organizationId: v.string(),
  name: v.string(),
});

const EMPTY = { events: [], invoices: [], people: [], artists: [] };

async function searchEvents(ctx: QueryCtx, search: string) {
  const rows = await ctx.db
    .query("events")
    .withSearchIndex("search_title", (q) => q.search("title", search))
    .take(EVENT_LIMIT);
  return rows.map((row) => ({
    _id: row._id,
    title: row.title,
    startAt: row.startAt,
    venueName: row.venueName,
    status: normalizeEventStatus(row.status),
  }));
}

/**
 * Number matches first (exact intent), then billing-host name matches. Search
 * indexes ignore case and prefix-match the last word, which the mixed-case
 * nanoid suffix needs: "pwwq" finds ALINV-PwWqpa9.
 */
async function searchInvoices(ctx: QueryCtx, search: string) {
  const [byNumber, byHost] = await Promise.all([
    ctx.db
      .query("invoices")
      .withSearchIndex("search_invoiceNumber", (q) => q.search("invoiceNumber", search))
      .take(INVOICE_LIMIT),
    ctx.db
      .query("invoices")
      .withSearchIndex("search_clientGroupName", (q) => q.search("clientGroupName", search))
      .take(INVOICE_LIMIT),
  ]);
  const seen = new Set<Id<"invoices">>();
  return [...byNumber, ...byHost]
    .filter((row) => {
      if (seen.has(row._id)) return false;
      seen.add(row._id);
      return true;
    })
    .slice(0, INVOICE_LIMIT)
    .map((row) => ({
      _id: row._id,
      invoiceNumber: row.invoiceNumber,
      clientGroupName: row.clientGroupName,
      status: row.status,
    }));
}

async function searchPeople(ctx: QueryCtx, lowered: string) {
  const users = await fetchAllBetterAuthRows<AuthUser>(ctx, "user", 500);
  return users
    .map((user) => ({
      id: getUserId(user),
      name: user.name?.trim() || user.email || "Unknown user",
      email: user.email ?? "",
      image: user.image ?? undefined,
    }))
    .filter(
      (person) =>
        person.id &&
        (person.name.toLowerCase().includes(lowered) || person.email.toLowerCase().includes(lowered)),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, PEOPLE_LIMIT);
}

async function searchArtists(ctx: QueryCtx, lowered: string) {
  const [organizations, ...profilesByType] = await Promise.all([
    fetchAllBetterAuthRows<SearchOrganizationRow>(ctx, "organization", 500),
    ...ARTIST_TYPES.map((type) =>
      ctx.db
        .query("organizationProfiles")
        .withIndex("by_organizationType", (q) => q.eq("organizationType", type))
        .take(ARTIST_PROFILE_SCAN_LIMIT),
    ),
  ]);
  const profiles = profilesByType.flat();
  // Past the scan cap, look the rest up one by one so no act loses its display
  // name or archived flag. Normally a no-op.
  if (profilesByType.some((rows) => rows.length === ARTIST_PROFILE_SCAN_LIMIT)) {
    const scanned = new Set(profiles.map((profile) => profile.organizationId));
    const missing = organizations
      .map((org) => org.id ?? org._id ?? "")
      .filter((organizationId) => organizationId && !scanned.has(organizationId));
    const extra = await Promise.all(
      missing.map((organizationId) =>
        ctx.db
          .query("organizationProfiles")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique(),
      ),
    );
    profiles.push(...extra.filter((profile) => profile !== null));
  }
  return matchArtists(organizations, profiles, lowered, ARTIST_LIMIT);
}

export const search = query({
  args: {
    query: v.string(),
    /** Off when the client shows a narrower view (crew mode) than the viewer's access. */
    includeOperations: v.boolean(),
    includeAdmin: v.boolean(),
  },
  returns: v.object({
    events: v.array(eventResultValue),
    invoices: v.array(invoiceResultValue),
    people: v.array(personResultValue),
    artists: v.array(artistResultValue),
  }),
  handler: async (ctx, args) => {
    const search = args.query
      .trim()
      .slice(0, MAX_QUERY_LENGTH)
      .split(/\s+/)
      .slice(0, MAX_SEARCH_TERMS)
      .join(" ");
    if (search.length < MIN_GLOBAL_SEARCH_CHARS) return EMPTY;
    const user = await getCurrentUserOrNull(ctx);
    if (!user || user.banned) return EMPTY;
    // Everything here is Arbor Live's own data; artists get page jumps only.
    const context = await getActiveOrganizationContextOrNull(ctx);
    if (context?.organizationType !== "arbor_internal") return EMPTY;

    const [isAdmin, isOperations] = await Promise.all([
      args.includeAdmin ? isStaffAdmin(ctx, user) : false,
      args.includeOperations ? hasOperationsAccess(ctx, user) : false,
    ]);
    const lowered = search.toLowerCase();
    const [events, invoices, people, artists] = await Promise.all([
      searchEvents(ctx, search),
      isOperations ? searchInvoices(ctx, search) : [],
      isAdmin ? searchPeople(ctx, lowered) : [],
      searchArtists(ctx, lowered),
    ]);
    return { events, invoices, people, artists };
  },
});
