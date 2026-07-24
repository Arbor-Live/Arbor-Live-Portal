import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  allocateBandPaymentConfirmationToken,
  allocateInvoiceNumber,
  allocateRequestNumber,
  isBandPaymentReferenceId,
  isInvoiceReferenceId,
  isRequestReferenceId,
} from "../lib/publicReferenceIds";

/**
 * Backfill invoice numbers to ALINV-XXXXXXX (nanoid suffix).
 * Run repeatedly until `remaining` is 0:
 *   npx convex run migrations/referenceIds:migrateInvoiceReferenceIds
 */
export const migrateInvoiceReferenceIds = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    migrated: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    const rows = await ctx.db.query("invoices").take(500);
    const pending = rows.filter((row) => !isInvoiceReferenceId(row.invoiceNumber));
    let migrated = 0;

    for (const row of pending.slice(0, limit)) {
      const invoiceNumber = await allocateInvoiceNumber(ctx);
      await ctx.db.patch(row._id, {
        invoiceNumber,
        updatedAt: Date.now(),
      });
      migrated += 1;
    }

    return {
      migrated,
      remaining: Math.max(0, pending.length - migrated),
    };
  },
});

/**
 * Backfill request numbers to ALREQ-XXXXXXX (nanoid suffix).
 * Run repeatedly until `remaining` is 0:
 *   npx convex run migrations/referenceIds:migrateRequestReferenceIds
 */
export const migrateRequestReferenceIds = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    migrated: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    const rows = await ctx.db.query("eventRequests").take(500);
    const pending = rows.filter((row) => !isRequestReferenceId(row.requestNumber));
    let migrated = 0;

    for (const row of pending.slice(0, limit)) {
      const requestNumber = await allocateRequestNumber(ctx);
      await ctx.db.patch(row._id, {
        requestNumber,
        updatedAt: Date.now(),
      });
      migrated += 1;
    }

    return {
      migrated,
      remaining: Math.max(0, pending.length - migrated),
    };
  },
});

/**
 * Backfill band payment confirmation tokens to ALBPAY-XXXXXXX.
 * Run repeatedly until `remaining` is 0:
 *   npx convex run migrations/referenceIds:migrateBandPaymentReferenceIds
 */
export const migrateBandPaymentReferenceIds = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    migrated: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    const rows = await ctx.db.query("eventBandPayments").take(500);
    const pending = rows.filter((row) => !isBandPaymentReferenceId(row.confirmationToken));
    let migrated = 0;

    for (const row of pending.slice(0, limit)) {
      const confirmationToken = await allocateBandPaymentConfirmationToken(ctx);
      await ctx.db.patch(row._id, {
        confirmationToken,
        updatedAt: Date.now(),
      });
      migrated += 1;
    }

    return {
      migrated,
      remaining: Math.max(0, pending.length - migrated),
    };
  },
});

/**
 * Migrate both invoices and event requests in one call.
 *   npx convex run migrations/referenceIds:migrateAllReferenceIds
 */
export const migrateAllReferenceIds = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    invoices: v.object({ migrated: v.number(), remaining: v.number() }),
    requests: v.object({ migrated: v.number(), remaining: v.number() }),
  }),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));

    const invoiceRows = await ctx.db.query("invoices").take(500);
    const invoicePending = invoiceRows.filter((row) => !isInvoiceReferenceId(row.invoiceNumber));
    let invoicesMigrated = 0;
    for (const row of invoicePending.slice(0, limit)) {
      const invoiceNumber = await allocateInvoiceNumber(ctx);
      await ctx.db.patch(row._id, { invoiceNumber, updatedAt: Date.now() });
      invoicesMigrated += 1;
    }

    const requestRows = await ctx.db.query("eventRequests").take(500);
    const requestPending = requestRows.filter((row) => !isRequestReferenceId(row.requestNumber));
    let requestsMigrated = 0;
    for (const row of requestPending.slice(0, limit)) {
      const requestNumber = await allocateRequestNumber(ctx);
      await ctx.db.patch(row._id, { requestNumber, updatedAt: Date.now() });
      requestsMigrated += 1;
    }

    return {
      invoices: {
        migrated: invoicesMigrated,
        remaining: Math.max(0, invoicePending.length - invoicesMigrated),
      },
      requests: {
        migrated: requestsMigrated,
        remaining: Math.max(0, requestPending.length - requestsMigrated),
      },
    };
  },
});
