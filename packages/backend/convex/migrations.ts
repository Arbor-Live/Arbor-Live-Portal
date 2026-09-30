import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { findAuthUserById } from "./lib/auth";
import { resolveContactNameParts } from "./lib/contactName";
import { resolveGlobalRoleForUser } from "./lib/globalRole";
import { normalizeHostOrgName } from "./lib/hostOrgIdentity";
import { upsertInvoicePerson } from "./lib/invoicePeople";
import {
  allocateBandPaymentConfirmationToken,
  allocateInvoiceNumber,
  allocateRequestNumber,
  isBandPaymentReferenceId,
  isInvoiceReferenceId,
  isRequestReferenceId,
} from "./lib/publicReferenceIds";
import { legacyTeamsToMembership } from "./lib/userVerticals";
import {
  LEGACY_MARKETING_EVENT_TEAM,
  eventTeamsAreCurrent,
  migrateEventTeams,
} from "./lib/eventTeams";
import { consolidatePackageIntoOneIncludedUnit } from "./lib/packageContentMigration";
import { normalizeCrewLineLabel } from "./lib/normalizeCrewLineLabel";
import { syncNeedBlocks, syncParticipationBlocks } from "./lib/runOfShow";
import { ensureActPosition } from "./lib/actPositions";
import { syncMultiDayGroupForInvoice } from "./lib/eventGroups";

/**
 * Official @convex-dev/migrations runner.
 *
 * Post-deploy (Vercel): `scripts/vercel-deploy.sh` — production uses
 * `convex run migrations:runAll`; preview uses `--preview-run` (preview keys
 * cannot target a branch deployment with a separate `convex run`).
 * Production deploy key needs `deployment:functions:runInternalMutations`.
 *
 * Manual:
 *   pnpm --filter backend migrate
 *   pnpm --filter backend migrate:prod
 *   npx convex run --component migrations lib:getStatus --watch
 *
 * Append new jobs to `MIGRATION_SERIES` only — never reorder or remove completed ones.
 */
export const migrations = new Migrations<DataModel>(components.migrations, {
  internalMutation,
});

export const run = migrations.runner();

/** Backfill invoiceGroups.normalizedName for host-org identity / alias matching. */
export const backfillHostOrgNormalizedNames = migrations.define({
  table: "invoiceGroups",
  migrateOne: async (_ctx, group) => {
    const normalizedName = normalizeHostOrgName(group.name);
    if (group.normalizedName === normalizedName) return;
    return { normalizedName, updatedAt: Date.now() };
  },
});

/** Upsert invoicePeople by email and link invoiceContacts.personId. */
export const backfillInvoicePeople = migrations.define({
  table: "invoiceContacts",
  migrateOne: async (ctx, contact) => {
    if (!contact.email?.trim() || contact.personId) return;
    const { firstName, lastName } = resolveContactNameParts(contact);
    const now = Date.now();
    const personId = await upsertInvoicePerson(ctx, {
      email: contact.email,
      firstName,
      lastName,
      phone: contact.phone,
      now,
    });
    if (!personId) return;
    return { personId, updatedAt: now };
  },
});

/** Backfill verticals + disciplines from legacy teams on userAdminProfiles. */
export const backfillUserVerticals = migrations.define({
  table: "userAdminProfiles",
  migrateOne: async (_ctx, profile) => {
    if (profile.verticals?.length || !(profile.teams?.length ?? 0)) return;
    const membership = legacyTeamsToMembership(profile.teams ?? []);
    return {
      verticals: membership.verticals,
      disciplines: membership.disciplines,
      updatedAt: Date.now(),
    };
  },
});

/**
 * Set visibility to public for internal events with no marketing poster assignee.
 */
export const backfillUnassignedEventsToPublic = migrations.define({
  table: "events",
  migrateOne: async (ctx, event) => {
    if (event.visibility !== "internal") return;
    const design = await ctx.db
      .query("eventMarketingDesigns")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .first();
    if (design?.assigneeUserId) return;
    return { visibility: "public" as const, updatedAt: Date.now() };
  },
});

/** Backfill invoice numbers to ALINV-XXXXXXX. */
export const migrateInvoiceReferenceIds = migrations.define({
  table: "invoices",
  // Each invoice reads its days plus Day 1's blocks, shifts and positions.
  batchSize: 10,
  migrateOne: async (ctx, invoice) => {
    if (isInvoiceReferenceId(invoice.invoiceNumber)) return;
    const invoiceNumber = await allocateInvoiceNumber(ctx);
    return { invoiceNumber, updatedAt: Date.now() };
  },
});

/** Backfill request numbers to ALREQ-XXXXXXX. */
export const migrateRequestReferenceIds = migrations.define({
  table: "eventRequests",
  batchSize: 25,
  migrateOne: async (ctx, request) => {
    if (isRequestReferenceId(request.requestNumber)) return;
    const requestNumber = await allocateRequestNumber(ctx);
    return { requestNumber, updatedAt: Date.now() };
  },
});

/** Backfill band payment confirmation tokens to ALBPAY-XXXXXXX. */
export const migrateBandPaymentReferenceIds = migrations.define({
  table: "eventBandPayments",
  batchSize: 25,
  migrateOne: async (ctx, payment) => {
    if (isBandPaymentReferenceId(payment.confirmationToken)) return;
    const confirmationToken = await allocateBandPaymentConfirmationToken(ctx);
    return { confirmationToken, updatedAt: Date.now() };
  },
});

/**
 * Backfill convertedEventIds on requests and sourceEventRequestId on linked events.
 */
export const migrateConvertedEventLinks = migrations.define({
  table: "eventRequests",
  batchSize: 20,
  migrateOne: async (ctx, row) => {
    if (row.status !== "converted") return;
    if (!row.convertedEventId && !row.linkedInvoiceId && !row.convertedEventIds?.length) {
      return;
    }

    const eventIds: Id<"events">[] = row.convertedEventIds?.length
      ? [...row.convertedEventIds]
      : row.convertedEventId
        ? [row.convertedEventId]
        : [];

    if (eventIds.length === 0 && row.linkedInvoiceId) {
      const invoiceEvents = await ctx.db
        .query("events")
        .withIndex("by_invoiceId", (q) => q.eq("invoiceId", row.linkedInvoiceId!))
        .take(50);
      for (const event of invoiceEvents) {
        eventIds.push(event._id);
      }
    }

    const uniqueEventIds = [...new Set(eventIds)];
    if (uniqueEventIds.length === 0) return;

    const sortedEvents = (
      await Promise.all(uniqueEventIds.map((eventId) => ctx.db.get(eventId)))
    )
      .filter((event): event is NonNullable<typeof event> => Boolean(event))
      .sort((a, b) => a.startAt - b.startAt || a._creationTime - b._creationTime);

    if (sortedEvents.length === 0) return;

    const now = Date.now();
    const convertedEventIds = sortedEvents.map((event) => event._id);
    const alreadyLinked = sortedEvents.every(
      (event) => event.sourceEventRequestId === row._id,
    );
    const idsUnchanged =
      row.convertedEventIds?.length === convertedEventIds.length &&
      convertedEventIds.every((id, index) => row.convertedEventIds?.[index] === id) &&
      row.convertedEventId === convertedEventIds[0];

    if (alreadyLinked && idsUnchanged) return;

    for (const event of sortedEvents) {
      if (event.sourceEventRequestId === row._id) continue;
      await ctx.db.patch(event._id, {
        sourceEventRequestId: row._id,
        updatedAt: now,
      });
    }

    return {
      convertedEventIds,
      convertedEventId: convertedEventIds[0],
      updatedAt: now,
    };
  },
});

export const backfillEventRequestMilestoneTimestamps = migrations.define({
  table: "eventRequests",
  migrateOne: async (_ctx, request) => {
    const patch: {
      reviewedAt?: number;
      convertedAt?: number;
      declinedAt?: number;
      updatedAt?: number;
    } = {};
    if (
      (request.status === "in_review" || request.status === "action_required") &&
      !request.reviewedAt
    ) {
      patch.reviewedAt = request.updatedAt;
    }
    if (request.status === "converted" && !request.convertedAt) {
      patch.convertedAt = request.updatedAt;
      if (!request.reviewedAt) patch.reviewedAt = request.updatedAt;
    }
    if (request.status === "declined" && !request.declinedAt) {
      patch.declinedAt = request.updatedAt;
    }
    if (Object.keys(patch).length === 0) return;
    patch.updatedAt = request.updatedAt;
    return patch;
  },
});

/**
 * Align booking-request status with quote state:
 * - in_review / action_required / premature converted → quote-derived status
 * - void quote → declined
 * - approved quote → converted
 * - sent, awaiting decision → pending_client
 * - otherwise → action_required
 */
export const realignBookingRequestStatusesToQuotes = migrations.define({
  table: "eventRequests",
  migrateOne: async (ctx, request) => {
    const now = Date.now();

    if (
      request.status !== "converted" &&
      request.status !== "action_required" &&
      request.status !== "in_review"
    ) {
      return;
    }

    let invoice = request.linkedInvoiceId
      ? await ctx.db.get(request.linkedInvoiceId)
      : null;
    if (!invoice) {
      invoice = await ctx.db
        .query("invoices")
        .withIndex("by_sourceEventRequestId", (q) =>
          q.eq("sourceEventRequestId", request._id),
        )
        .unique();
    }

    if (invoice?.status === "void") {
      await ctx.db.patch(request._id, {
        status: "declined",
        declinedAt: request.declinedAt ?? request.updatedAt,
        declineReasonCode: request.declineReasonCode ?? "client_withdrew",
        convertedAt: undefined,
        updatedAt: now,
      });
      return;
    }

    if ((invoice?.clientApprovalStatus ?? "pending") === "approved") {
      if (request.status === "converted" && request.convertedAt) return;
      await ctx.db.patch(request._id, {
        status: "converted",
        convertedAt: request.convertedAt ?? request.updatedAt,
        reviewedAt: request.reviewedAt ?? request.updatedAt,
        updatedAt: now,
      });
      return;
    }

    const awaitingClient =
      Boolean(invoice?.clientReviewReadyAt) &&
      (invoice?.clientApprovalStatus ?? "pending") === "pending";
    const nextStatus = awaitingClient ? ("pending_client" as const) : ("action_required" as const);
    if (request.status === nextStatus && !request.convertedAt) return;

    await ctx.db.patch(request._id, {
      status: nextStatus,
      reviewedAt: request.reviewedAt ?? request.updatedAt,
      convertedAt: undefined,
      updatedAt: now,
    });
  },
});

/**
 * Split action_required → pending_client when a quote is already on the portal
 * awaiting a client decision. Also declines open requests whose linked quote is
 * already void. Append-only follow-up for deployments that ran the earlier
 * realign before pending_client / void handling existed.
 */
export const realignBookingRequestPendingClient = migrations.define({
  table: "eventRequests",
  migrateOne: async (ctx, request) => {
    if (
      request.status !== "action_required" &&
      request.status !== "converted" &&
      request.status !== "pending_client" &&
      request.status !== "in_review"
    ) {
      return;
    }

    let invoice = request.linkedInvoiceId
      ? await ctx.db.get(request.linkedInvoiceId)
      : null;
    if (!invoice) {
      invoice = await ctx.db
        .query("invoices")
        .withIndex("by_sourceEventRequestId", (q) =>
          q.eq("sourceEventRequestId", request._id),
        )
        .unique();
    }
    if (!invoice) return;

    const now = Date.now();
    if (invoice.status === "void") {
      await ctx.db.patch(request._id, {
        status: "declined",
        declinedAt: request.declinedAt ?? request.updatedAt,
        declineReasonCode: request.declineReasonCode ?? "client_withdrew",
        convertedAt: undefined,
        updatedAt: now,
      });
      return;
    }

    if ((invoice.clientApprovalStatus ?? "pending") === "approved") {
      if (request.status === "converted" && request.convertedAt) return;
      await ctx.db.patch(request._id, {
        status: "converted",
        convertedAt: request.convertedAt ?? request.updatedAt,
        reviewedAt: request.reviewedAt ?? request.updatedAt,
        updatedAt: now,
      });
      return;
    }

    const awaitingClient =
      Boolean(invoice.clientReviewReadyAt) &&
      (invoice.clientApprovalStatus ?? "pending") === "pending";
    const nextStatus = awaitingClient ? ("pending_client" as const) : ("action_required" as const);
    if (request.status === nextStatus) return;

    await ctx.db.patch(request._id, {
      status: nextStatus,
      convertedAt: undefined,
      reviewedAt: request.reviewedAt ?? request.updatedAt,
      updatedAt: now,
    });
  },
});

/**
 * Convert legacy flat BOM + wrongly-split single-option units into one
 * included content unit per package. Exclusive units (2+ options) stay.
 */
export const migratePackageLegacyItemsToContentUnits = migrations.define({
  table: "inventoryPackages",
  batchSize: 15,
  migrateOne: async (ctx, pkg) => {
    await consolidatePackageIntoOneIncludedUnit(ctx, pkg._id, Date.now());
  },
});

/**
 * Re-run consolidation after the first migration created one unit per line.
 * Append-only series entry — safe if already consolidated (no-op when already one unit).
 */
export const consolidatePackageContentUnits = migrations.define({
  table: "inventoryPackages",
  batchSize: 15,
  migrateOne: async (ctx, pkg) => {
    await consolidatePackageIntoOneIncludedUnit(ctx, pkg._id, Date.now());
  },
});

/**
 * Drop legacy `inputs[].group` (band-editable DCA labels). Grouping is now
 * derived from `sourceKey` via `inputFamilyLabel` in `@arbor/rider-document`.
 */
export const stripBandRiderInputGroups = migrations.define({
  table: "bandRiders",
  migrateOne: async (_ctx, rider) => {
    type LegacyInput = (typeof rider.inputs)[number] & { group?: string };
    const inputs = rider.inputs as LegacyInput[];
    if (!inputs.some((input) => input.group !== undefined)) return;

    return {
      inputs: inputs.map((input) => {
        const { group: _removed, ...rest } = input;
        return rest;
      }),
      updatedAt: Date.now(),
    };
  },
});

/**
 * Copy event comment threads into the generic `comments` table.
 *
 * Idempotent: the runner can re-run, and the source rows are left in place
 * until `eventComments` is dropped in a follow-up, so a re-run must not
 * duplicate. (`createdAt` is minted per comment, so subject + author +
 * createdAt identifies the copy.)
 */
export const migrateEventCommentsToComments = migrations.define({
  table: "eventComments",
  migrateOne: async (ctx, comment) => {
    const existing = await ctx.db
      .query("comments")
      .withIndex("by_subject_and_createdAt", (q) =>
        q
          .eq("subjectType", "event")
          .eq("subjectId", comment.eventId)
          .eq("createdAt", comment.createdAt),
      )
      .take(20);
    if (existing.some((row) => row.authorUserId === comment.authorUserId)) return;

    await ctx.db.insert("comments", {
      subjectType: "event",
      subjectId: comment.eventId,
      authorUserId: comment.authorUserId,
      body: comment.body,
      mentionedUserIds: comment.mentionedUserIds,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    });
  },
});

/**
 * Collapse crew line labels where role was copied from the assignee name, e.g.
 * `Setup — Alex (Alex (Lead))` → `Setup — Alex (Lead)`.
 */
export const normalizeInvoiceCrewLineLabels = migrations.define({
  table: "invoiceLineItems",
  migrateOne: async (_ctx, row) => {
    if (row.section !== "crew") return;
    const label = normalizeCrewLineLabel(row.label);
    if (label === row.label) return;
    return { label, updatedAt: Date.now() };
  },
});

/** Flatten fixed band profile link fields into the flexible artistLinks array. */
export const backfillOrgArtistLinks = migrations.define({
  table: "organizationProfiles",
  migrateOne: async (_ctx, profile) => {
    if (profile.artistLinks?.length) return;
    const links: Array<{ label: string; url: string; icon?: string }> = [];
    const push = (label: string, url: string | undefined, icon: string) => {
      const trimmed = url?.trim();
      if (trimmed) links.push({ label, url: trimmed, icon });
    };
    push("Website", profile.publicWebsiteUrl, "Globe");
    push("Instagram", profile.publicInstagramUrl, "InstagramLogo");
    push("YouTube", profile.publicYoutubeUrl, "YoutubeLogo");
    push("Spotify", profile.publicSpotifyUrl, "SpotifyLogo");
    if (!links.length) return;
    return { artistLinks: links, updatedAt: Date.now() };
  },
});

/** Flatten fixed band application link fields into the flexible artistLinks array. */
export const backfillBandApplicationArtistLinks = migrations.define({
  table: "bandApplications",
  migrateOne: async (_ctx, application) => {
    if (application.artistLinks?.length) return;
    const links: Array<{ label: string; url: string; icon?: string }> = [];
    const push = (label: string, url: string | undefined, icon: string) => {
      const trimmed = url?.trim();
      if (trimmed) links.push({ label, url: trimmed, icon });
    };
    push("Website", application.publicWebsiteUrl, "Globe");
    push("Instagram", application.publicInstagramUrl, "InstagramLogo");
    push("YouTube", application.publicYoutubeUrl, "YoutubeLogo");
    if (!links.length) return;
    return { artistLinks: links };
  },
});

/** Copy the deprecated `artistType` into `organizationType`. */
export const migrateOrgArtistTypeToOrganizationType = migrations.define({
  table: "organizationProfiles",
  migrateOne: async (_ctx, profile) => {
    const legacy = profile.artistType;
    if (!legacy || legacy === "band") return;
    if (profile.organizationType && profile.organizationType !== "band") return;
    if (legacy !== "dj" && legacy !== "singer_songwriter" && legacy !== "other") return;
    return {
      organizationType: legacy as "dj" | "singer_songwriter" | "other",
      updatedAt: Date.now(),
    };
  },
});

export const migrateBandApplicationArtistTypeToOrganizationType = migrations.define({
  table: "bandApplications",
  migrateOne: async (_ctx, application) => {
    const legacy = application.artistType;
    if (!legacy || application.organizationType) return;
    if (legacy !== "band" && legacy !== "dj" && legacy !== "singer_songwriter" && legacy !== "other") {
      return;
    }
    return {
      organizationType: legacy as "band" | "dj" | "singer_songwriter" | "other",
    };
  },
});

/**
 * Scope existing artist invoice lines to the invoice's first linked event so
 * per-day TBD slots and band autofill have a day to target (multi-day bookings).
 */
export const backfillInvoiceArtistLineEvents = migrations.define({
  table: "invoiceLineItems",
  migrateOne: async (ctx, row) => {
    if (row.section !== "artist" || row.eventId) return;
    const first = await ctx.db
      .query("events")
      .withIndex("by_invoiceId_and_startAt", (q) => q.eq("invoiceId", row.invoiceId))
      .first();
    if (!first) return;
    return { eventId: first._id, updatedAt: Date.now() };
  },
});

/**
 * Unset the retired OSE hiring form timestamp on crew onboarding rows.
 *
 * Step 1 of a widen/migrate/narrow removal: `oseHiringFormCompletedAt` stays in
 * the schema until this has run on every deployment, then it can be dropped.
 * Reads/writes go through a widened type so this keeps compiling once the field
 * is removed from the schema.
 */
export const dropCrewOnboardingOseHiringForm = migrations.define({
  table: "userOnboarding",
  migrateOne: async (_ctx, row) => {
    const legacy = row as Doc<"userOnboarding"> & {
      oseHiringFormCompletedAt?: number;
    };
    if (legacy.oseHiringFormCompletedAt === undefined) return;
    return {
      oseHiringFormCompletedAt: undefined,
    } as unknown as Partial<Doc<"userOnboarding">>;
  },
});

/** Rename the retired "Marketing" event team to "Promotion" on events. */
export const migrateEventTeamsMarketingToPromotionOnEvents = migrations.define({
  table: "events",
  migrateOne: async (ctx, event) => {
    if (!event.teamsInterested?.length) return;
    let teamsInterested = migrateEventTeams(event.teamsInterested) ?? [];
    // Legacy "Marketing" also gated poster work; keep events that already have a
    // poster design on the design board by tagging them "Design" too.
    if (
      event.teamsInterested.includes(LEGACY_MARKETING_EVENT_TEAM) &&
      !teamsInterested.includes("Design")
    ) {
      const design = await ctx.db
        .query("eventMarketingDesigns")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .first();
      if (design) teamsInterested = [...teamsInterested, "Design"];
    }
    if (eventTeamsAreCurrent(event.teamsInterested, teamsInterested)) return;
    return { teamsInterested, updatedAt: Date.now() };
  },
});

/** Rename the retired "Marketing" event team to "Promotion" on event series. */
export const migrateEventTeamsMarketingToPromotionOnEventSeries = migrations.define({
  table: "eventSeries",
  migrateOne: async (_ctx, series) => {
    if (!series.teamsInterested?.length) return;
    const teamsInterested = migrateEventTeams(series.teamsInterested) ?? [];
    if (eventTeamsAreCurrent(series.teamsInterested, teamsInterested)) return;
    return { teamsInterested, updatedAt: Date.now() };
  },
});

/**
 * Demote artist-org admins whose Better Auth `role` is a stale `admin`.
 *
 * Before the invite path was fixed (Harden auth, #282), accepting an invite with
 * `org_admin` set the global role to `admin` for any organization, bands/DJs
 * included. Those rows still grant portal-wide privileges through `requireAdmin`
 * and the dashboard, and made every one of them receive Arbor-admin email.
 *
 * Reads the role from active memberships (`resolveGlobalRoleForUser`) and only
 * ever demotes. Legacy admins with no membership rows, and real Arbor admins,
 * keep `admin`; each deployment's first admin is Arbor-internal, so this cannot
 * remove the last admin.
 */
export const recomputeArtistOrgAdminGlobalRoles = migrations.define({
  table: "userAdminProfiles",
  migrateOne: async (ctx, profile) => {
    const userId = profile.userId?.trim();
    if (!userId) return;
    const user = await findAuthUserById(ctx, userId);
    if (!user || user.role !== "admin" || !user.email) return;
    if ((await resolveGlobalRoleForUser(ctx, userId)) === "admin") return;
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        where: [{ field: "email", value: user.email.trim().toLowerCase() }],
        update: { role: "member", updatedAt: Date.now() },
      },
    });
  },
});

/**
 * Run of show: mirror existing lineup set/soundcheck times into linked
 * `soundcheck` / `set` schedule blocks. Idempotent — syncing an act that
 * already has matching blocks writes nothing.
 */
export const backfillRunOfShowParticipationBlocks = migrations.define({
  table: "eventBandParticipations",
  migrateOne: async (ctx, row) => {
    if (row.setStartsAt == null && row.soundcheckStartsAt == null) return;
    await syncParticipationBlocks(ctx, row._id);
  },
});

export const backfillRunOfShowNeedBlocks = migrations.define({
  table: "eventArtistNeeds",
  migrateOne: async (ctx, row) => {
    if (row.setStartsAt == null && row.soundcheckStartsAt == null) return;
    await syncNeedBlocks(ctx, row._id);
  },
});

/** Every act on the bill fills a lineup position; give unslotted acts one. */
export const giveEveryActAPosition = migrations.define({
  table: "eventBandParticipations",
  migrateOne: async (ctx, row) => {
    if (row.needId) return;
    await ensureActPosition(ctx, row._id);
  },
});

/**
 * Standalone quotes approved from their public link before approval finalized
 * the invoice stayed `status: "draft"` with `clientApprovalStatus: "approved"`,
 * hiding them from the active invoice list, payment queue, and revenue
 * analytics. Approval now finalizes; this realigns the existing rows.
 */
export const finalizeApprovedDraftInvoices = migrations.define({
  table: "invoices",
  migrateOne: async (_ctx, invoice) => {
    if (invoice.status !== "draft" || invoice.clientApprovalStatus !== "approved") return;
    return { status: "finalized" as const, updatedAt: Date.now() };
  },
});

/**
 * Backfill `status` on userAdminProfiles from the legacy `active` boolean.
 * `active: false` meant "removed" (banned) which is the new `alumni` state.
 */
export const backfillUserProfileStatus = migrations.define({
  table: "userAdminProfiles",
  migrateOne: async (_ctx, profile) => {
    if (profile.status) return;
    return {
      status: profile.active === false ? ("alumni" as const) : ("active" as const),
      updatedAt: Date.now(),
    };
  },
});

/**
 * Consolidate the legacy `weeklyDigest` / `damageReportEmails` profile flags
 * into the single `emailOptOuts` list. Idempotent: profiles that already carry
 * an opt-out list are left alone.
 *
 * Reads the removed fields through a widened type so this keeps compiling after
 * the schema narrowed; it is already complete on deployments that ran it.
 */
export const backfillUserEmailOptOuts = migrations.define({
  table: "userAdminProfiles",
  migrateOne: async (_ctx, profile) => {
    if (profile.emailOptOuts !== undefined) return;
    const legacy = profile as Doc<"userAdminProfiles"> & {
      weeklyDigest?: boolean;
      damageReportEmails?: boolean;
    };
    const emailOptOuts: string[] = [];
    if (legacy.weeklyDigest === false) emailOptOuts.push("weekly_digest");
    // Advisor presets historically omitted `damageReportEmails` while setting
    // the three crew flags false; treat that as opted out of damage reports.
    const damageReportOff =
      legacy.damageReportEmails === false ||
      (legacy.damageReportEmails === undefined &&
        legacy.requiresOnboarding === false &&
        legacy.includeInTimecards === false &&
        legacy.assignableAsCrew === false);
    if (damageReportOff) emailOptOuts.push("damage_report_admin");
    return { emailOptOuts, updatedAt: Date.now() };
  },
});

/**
 * Widen → migrate → narrow, step 2: drop the deprecated profile flags now that
 * `backfillUserEmailOptOuts` has copied them across. The fields are gone from
 * the schema, so this reads/writes them through a widened type; it is already
 * complete on deployments that ran it.
 */
export const unsetLegacyUserEmailFlags = migrations.define({
  table: "userAdminProfiles",
  migrateOne: async (_ctx, profile) => {
    const legacy = profile as Doc<"userAdminProfiles"> & {
      weeklyDigest?: boolean;
      damageReportEmails?: boolean;
    };
    if (legacy.weeklyDigest === undefined && legacy.damageReportEmails === undefined) {
      return;
    }
    return {
      weeklyDigest: undefined,
      damageReportEmails: undefined,
    } as unknown as Partial<Doc<"userAdminProfiles">>;
  },
});

/** Widen → migrate → narrow, step 2: drop the deprecated pending-invite flag. */
export const unsetLegacyPendingInviteEmailFlags = migrations.define({
  table: "pendingUserInvites",
  migrateOne: async (_ctx, row) => {
    const legacy = row as Doc<"pendingUserInvites"> & { damageReportEmails?: boolean };
    if (legacy.damageReportEmails === undefined) return;
    return { damageReportEmails: undefined } as unknown as Partial<
      Doc<"pendingUserInvites">
    >;
  },
});

/** Event groups (#341), step 2: every existing series is a recurring group. */
export const backfillEventGroupKinds = migrations.define({
  table: "eventSeries",
  migrateOne: async (_ctx, series) => {
    if (series.kind !== undefined) return;
    return { kind: "recurring" as const };
  },
});

/**
 * Event groups (#341), step 3: each invoice whose primary days number two or
 * more (and aren't one recurring series) becomes a `multi_day` group, with its
 * templates derived from Day 1. Idempotent: re-running re-syncs membership.
 * No day's schedule, crew or lineup changes.
 */
export const groupMultiDayBookings = migrations.define({
  table: "invoices",
  // Each invoice reads its days plus Day 1's blocks, shifts and positions.
  batchSize: 10,
  migrateOne: async (ctx, invoice) => {
    await syncMultiDayGroupForInvoice(ctx, invoice._id, Date.now());
  },
});

/**
 * never reorder or remove completed ones (reset requires an explicit reset:true).
 */
const MIGRATION_SERIES = [
  internal.migrations.backfillHostOrgNormalizedNames,
  internal.migrations.backfillInvoicePeople,
  internal.migrations.backfillUserVerticals,
  internal.migrations.backfillUnassignedEventsToPublic,
  internal.migrations.migrateInvoiceReferenceIds,
  internal.migrations.migrateRequestReferenceIds,
  internal.migrations.migrateBandPaymentReferenceIds,
  internal.migrations.migrateConvertedEventLinks,
  internal.migrations.backfillEventRequestMilestoneTimestamps,
  internal.migrations.realignBookingRequestStatusesToQuotes,
  internal.migrations.realignBookingRequestPendingClient,
  internal.migrations.migratePackageLegacyItemsToContentUnits,
  internal.migrations.consolidatePackageContentUnits,
  internal.migrations.stripBandRiderInputGroups,
  internal.migrations.migrateEventCommentsToComments,
  internal.migrations.normalizeInvoiceCrewLineLabels,
  internal.migrations.backfillOrgArtistLinks,
  internal.migrations.backfillBandApplicationArtistLinks,
  internal.migrations.migrateOrgArtistTypeToOrganizationType,
  internal.migrations.migrateBandApplicationArtistTypeToOrganizationType,
  internal.migrations.backfillInvoiceArtistLineEvents,
  internal.migrations.dropCrewOnboardingOseHiringForm,
  internal.migrations.migrateEventTeamsMarketingToPromotionOnEvents,
  internal.migrations.migrateEventTeamsMarketingToPromotionOnEventSeries,
  internal.migrations.recomputeArtistOrgAdminGlobalRoles,
  internal.migrations.backfillRunOfShowParticipationBlocks,
  internal.migrations.backfillRunOfShowNeedBlocks,
  internal.migrations.giveEveryActAPosition,
  internal.migrations.finalizeApprovedDraftInvoices,
  internal.migrations.backfillUserProfileStatus,
  internal.migrations.backfillUserEmailOptOuts,
  internal.migrations.unsetLegacyUserEmailFlags,
  internal.migrations.unsetLegacyPendingInviteEmailFlags,
  internal.migrations.backfillEventGroupKinds,
  internal.migrations.groupMultiDayBookings,
] as const;

export const runAll = migrations.runner([...MIGRATION_SERIES]);
