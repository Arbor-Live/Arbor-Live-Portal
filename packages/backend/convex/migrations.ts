import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { resolveContactNameParts } from "./lib/contactName";
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

/**
 * Official @convex-dev/migrations runner.
 *
 * Post-deploy (Vercel): `convex run migrations:runAll` after `convex deploy`
 * (see `apps/web/vercel.json`). The deploy key needs
 * `deployment:functions:runInternalMutations` in addition to `deployment:deploy`.
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
  batchSize: 25,
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

/**
 * Ordered post-deploy series. Add new migrations to the end of this list —
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
] as const;

export const runAll = migrations.runner([...MIGRATION_SERIES]);
