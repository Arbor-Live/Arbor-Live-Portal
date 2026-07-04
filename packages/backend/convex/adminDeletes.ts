import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireArborInternalContext } from "./lib/auth";
import {
  deleteEventRecord,
  deleteInvoiceRecord,
  findRequestForInvoice,
  unlinkInvoicePeers,
  unlinkRequestPeers,
} from "./lib/bookingChainDelete";
import { listEventsByInvoiceId } from "./lib/invoiceEvents";
import { listEventsLinkedToRequest } from "./lib/bookingDayLoad";

const linkedQuotePreview = v.object({
  id: v.id("invoices"),
  number: v.string(),
});

const linkedRequestPreview = v.object({
  id: v.id("eventRequests"),
  number: v.string(),
});

const linkedEventPreview = v.object({
  id: v.id("events"),
  title: v.string(),
});

const deletePreviewShape = v.object({
  label: v.string(),
  linkedQuote: v.optional(linkedQuotePreview),
  linkedRequest: v.optional(linkedRequestPreview),
  linkedEvents: v.array(linkedEventPreview),
});

const deleteResultShape = v.object({
  deletedQuote: v.boolean(),
  deletedRequest: v.boolean(),
  deletedEvents: v.number(),
});

export const previewRequestDeletion = query({
  args: { id: v.id("eventRequests") },
  returns: deletePreviewShape,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Request not found.");

    let linkedQuote: { id: Id<"invoices">; number: string } | undefined;
    if (request.linkedInvoiceId) {
      const invoice = await ctx.db.get(request.linkedInvoiceId);
      if (invoice) {
        linkedQuote = { id: invoice._id, number: invoice.invoiceNumber };
      }
    }

    const linkedEvents = (await listEventsLinkedToRequest(ctx, request)).map((event) => ({
      id: event._id,
      title: event.title,
    }));

    return {
      label: request.requestNumber ?? `LEGACY-${request._id}`,
      linkedQuote,
      linkedRequest: undefined,
      linkedEvents,
    };
  },
});

export const previewInvoiceDeletion = query({
  args: { id: v.id("invoices") },
  returns: deletePreviewShape,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");

    const request = await findRequestForInvoice(ctx, args.id);
    const events = await listEventsByInvoiceId(ctx, args.id);

    return {
      label: invoice.invoiceNumber,
      linkedQuote: undefined,
      linkedRequest: request
        ? {
            id: request._id,
            number: request.requestNumber ?? `LEGACY-${request._id}`,
          }
        : undefined,
      linkedEvents: events.map((event) => ({ id: event._id, title: event.title })),
    };
  },
});

export const deleteRequestAdmin = mutation({
  args: {
    id: v.id("eventRequests"),
    cascade: v.boolean(),
  },
  returns: deleteResultShape,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Request not found.");

    let deletedQuote = false;
    let deletedEvents = 0;

    if (args.cascade) {
      const linkedEvents = await listEventsLinkedToRequest(ctx, request);
      for (const event of linkedEvents) {
        await deleteEventRecord(ctx, event._id);
        deletedEvents += 1;
      }
      if (request.linkedInvoiceId) {
        const invoice = await ctx.db.get(request.linkedInvoiceId);
        if (invoice) {
          await deleteInvoiceRecord(ctx, invoice._id);
          deletedQuote = true;
        }
      }
    } else {
      await unlinkRequestPeers(ctx, request);
    }

    await ctx.db.delete(args.id);

    return {
      deletedQuote,
      deletedRequest: true,
      deletedEvents,
    };
  },
});

export const deleteInvoiceAdmin = mutation({
  args: {
    id: v.id("invoices"),
    cascade: v.boolean(),
  },
  returns: deleteResultShape,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");

    const request = await findRequestForInvoice(ctx, args.id);
    const events = await listEventsByInvoiceId(ctx, args.id);

    let deletedRequest = false;
    let deletedEvents = 0;

    if (args.cascade) {
      for (const event of events) {
        await deleteEventRecord(ctx, event._id);
        deletedEvents += 1;
      }
      if (request) {
        await ctx.db.delete(request._id);
        deletedRequest = true;
      }
    } else {
      await unlinkInvoicePeers(ctx, args.id);
    }

    await deleteInvoiceRecord(ctx, args.id);

    return {
      deletedQuote: true,
      deletedRequest,
      deletedEvents,
    };
  },
});
