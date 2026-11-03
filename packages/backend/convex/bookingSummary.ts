import { v } from "convex/values";
import {
  dateTimeFormat,
  PORTAL_TIMEZONE,
  renderEmailSummaryBlock,
  writeEmailSummaryBlock,
} from "@arbor/format";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { appError } from "./lib/errors";
import { requireEventEditAccess } from "./lib/eventAccess";
import { MAX_ADDITIONAL_INVOICES_PER_EVENT } from "./lib/eventInvoiceLinks";
import { findThreadForBooking, resolveBookingRefs } from "./lib/emailThreads";
import { listEventsLinkedToInvoice } from "./lib/invoiceEvents";
import {
  buildTranscript,
  filterOperationalBullets,
  MAX_SUMMARY_MESSAGES,
  requestOperationalNotes,
} from "./lib/bookingSummary";

/** One retry for a gateway that 429s or 5xxs; a longer outage is logged and left for the manual button. */
const RETRY_DELAY_MS = 60_000;

/** One stored block per invoice an event can link: its primary invoice plus the additional ones. */
const MAX_STORED_SUMMARY_BLOCKS = MAX_ADDITIONAL_INVOICES_PER_EVENT + 1;

const summaryTarget = v.union(
  v.object({ invoiceId: v.id("invoices") }),
  v.object({ eventId: v.id("events") }),
);
type SummaryTarget = { invoiceId: Id<"invoices"> } | { eventId: Id<"events"> };

const summaryInputValue = v.object({
  threadId: v.union(v.id("emailThreads"), v.null()),
  messages: v.array(
    v.object({
      direction: v.union(v.literal("inbound"), v.literal("outbound")),
      fromName: v.optional(v.string()),
      fromEmail: v.string(),
      bodyText: v.string(),
    }),
  ),
  eventIds: v.array(v.id("events")),
  /** The block key; null when the booking has no invoice to key it to. */
  invoice: v.union(v.object({ id: v.id("invoices"), number: v.string() }), v.null()),
  /** When the client approved the quote, if they have. */
  approvedAt: v.union(v.number(), v.null()),
  /** When this transcript was read; a write from an older snapshot never replaces a newer one. */
  snapshotAt: v.number(),
});

/**
 * Everything one summary needs, read in one transaction: the newest messages
 * (oldest first), the events to write to, the invoice that keys the block and
 * the approval date for the label. An invoice target writes to every event
 * linked to it; an event target to that event only, keyed to its invoice.
 */
export const loadSummaryInput = internalQuery({
  args: { target: summaryTarget },
  returns: summaryInputValue,
  handler: async (ctx, { target }) => {
    const refs = await resolveBookingRefs(ctx, target);
    const invoiceId = "invoiceId" in target ? target.invoiceId : refs.invoiceId;
    const [thread, invoice, linkedEvents] = await Promise.all([
      findThreadForBooking(ctx, refs),
      invoiceId ? ctx.db.get(invoiceId) : null,
      "invoiceId" in target ? listEventsLinkedToInvoice(ctx, target.invoiceId) : [],
    ]);
    const eventIds = "eventId" in target ? [target.eventId] : linkedEvents.map((event) => event._id);
    const newest = thread
      ? await ctx.db
          .query("emailMessages")
          .withIndex("by_threadId_and_receivedAt", (q) => q.eq("threadId", thread._id))
          .order("desc")
          .take(MAX_SUMMARY_MESSAGES)
      : [];
    return {
      threadId: thread?._id ?? null,
      messages: newest.reverse().map((message) => ({
        direction: message.direction,
        fromName: message.fromName,
        fromEmail: message.fromEmail,
        bodyText: message.bodyText,
      })),
      eventIds,
      invoice: invoice ? { id: invoice._id, number: invoice.invoiceNumber } : null,
      approvedAt:
        invoice && (invoice.clientApprovalStatus ?? "pending") === "approved"
          ? (invoice.approvedAt ?? null)
          : null,
      snapshotAt: Date.now(),
    };
  },
});

type StoredSummaryBlock = NonNullable<Doc<"events">["emailSummaryBlocks"]>[number];

/**
 * Put the block in each event's notes. The block replaces the one this invoice
 * wrote before only while that one still reads exactly as written; otherwise
 * it is appended and staff text stays as it is (`@arbor/format`
 * `writeEmailSummaryBlock`). An event whose stored block came from a newer
 * transcript is skipped. Returns how many events were written.
 */
export const writeSummary = internalMutation({
  args: {
    eventIds: v.array(v.id("events")),
    invoiceId: v.id("invoices"),
    invoiceNumber: v.string(),
    bullets: v.array(v.string()),
    label: v.string(),
    generatedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const block = renderEmailSummaryBlock({
      invoiceNumber: args.invoiceNumber,
      label: args.label,
      bullets: args.bullets,
    });
    let written = 0;
    for (const eventId of args.eventIds) {
      const event = await ctx.db.get(eventId);
      if (!event) continue;
      const stored = event.emailSummaryBlocks ?? [];
      const previous = stored.find((entry) => entry.invoiceId === args.invoiceId);
      if (previous && previous.generatedAt > args.generatedAt) continue;
      const { notes } = writeEmailSummaryBlock(event.notes, {
        invoiceNumber: args.invoiceNumber,
        block,
        previous: previous?.text ?? null,
      });
      const next: StoredSummaryBlock[] = [
        ...stored.filter((entry) => entry.invoiceId !== args.invoiceId),
        { invoiceId: args.invoiceId, text: block, generatedAt: args.generatedAt },
      ]
        // Forgetting an old entry only means its next write appends instead of replacing.
        .sort((a, b) => b.generatedAt - a.generatedAt)
        .slice(0, MAX_STORED_SUMMARY_BLOCKS);
      await ctx.db.patch(eventId, { notes, emailSummaryBlocks: next, updatedAt: Date.now() });
      written += 1;
    }
    return written;
  },
});

/** Staff gate for the manual button: runs as the signed-in caller. */
export const requireSummaryAccess = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    await requireEventEditAccess(ctx, args.eventId);
    return null;
  },
});

function summaryLabelDate(ms: number) {
  return dateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

type SummaryOutcome =
  | { status: "written"; events: number }
  | { status: "nothing" }
  | { status: "no_invoice" }
  | { status: "failed"; retryable: boolean; reason: string; userMessage?: string };

async function summarizeBooking(ctx: ActionCtx, target: SummaryTarget): Promise<SummaryOutcome> {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    return { status: "failed", retryable: false, reason: "AI_GATEWAY_API_KEY is not set" };
  }

  const input = await ctx.runQuery(internal.bookingSummary.loadSummaryInput, { target });
  // Our own templates are all we would be summarizing without a client message.
  if (!input.threadId || !input.messages.some((message) => message.direction === "inbound")) {
    return { status: "nothing" };
  }
  if (!input.invoice) return { status: "no_invoice" };
  if (input.eventIds.length === 0) return { status: "written", events: 0 };

  const result = await requestOperationalNotes(apiKey, buildTranscript(input.messages));
  if (!result.ok) {
    return {
      status: "failed",
      retryable: result.retryable,
      reason: result.reason,
      userMessage: result.userMessage,
    };
  }

  const { kept, dropped } = filterOperationalBullets(result.bullets);
  if (dropped > 0) {
    console.log(`[bookingSummary] dropped ${dropped} pricing-like bullet(s) from the model reply`);
  }
  if (kept.length === 0) return { status: "nothing" };

  const label =
    input.approvedAt !== null
      ? `quote approved ${summaryLabelDate(input.approvedAt)}`
      : `as of ${summaryLabelDate(input.snapshotAt)}`;
  const events = await ctx.runMutation(internal.bookingSummary.writeSummary, {
    eventIds: input.eventIds,
    invoiceId: input.invoice.id,
    invoiceNumber: input.invoice.number,
    bullets: kept,
    label,
    generatedAt: input.snapshotAt,
  });
  return { status: "written", events };
}

/** Never the error text: a failed write's message can carry the bullets it was given. */
function errorName(error: unknown) {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * Scheduled when a client approves a quote. Never throws: approval already
 * committed, so a failure is logged and the staff button covers it.
 */
export const summarizeForInvoice = internalAction({
  args: { invoiceId: v.id("invoices"), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = args.attempt ?? 0;
    let outcome: SummaryOutcome;
    try {
      outcome = await summarizeBooking(ctx, { invoiceId: args.invoiceId });
    } catch (error) {
      console.error(`[bookingSummary] invoice ${args.invoiceId}: unexpected ${errorName(error)}`);
      return null;
    }
    if (outcome.status === "failed") {
      if (outcome.retryable && attempt === 0) {
        console.warn(
          `[bookingSummary] invoice ${args.invoiceId}: ${outcome.reason}; retrying in ${RETRY_DELAY_MS / 1000}s`,
        );
        await ctx.scheduler.runAfter(RETRY_DELAY_MS, internal.bookingSummary.summarizeForInvoice, {
          invoiceId: args.invoiceId,
          attempt: 1,
        });
      } else {
        console.error(
          `[bookingSummary] invoice ${args.invoiceId}: gave up after ${attempt + 1} attempt(s): ${outcome.reason}`,
        );
      }
    } else {
      console.log(
        `[bookingSummary] invoice ${args.invoiceId}: ${outcome.status}${
          outcome.status === "written" ? ` to ${outcome.events} event(s)` : ""
        }`,
      );
    }
    return null;
  },
});

const summaryButtonResult = v.object({
  result: v.union(v.literal("written"), v.literal("nothing"), v.literal("no_invoice")),
  /** Events whose notes were written; 0 when a newer summary already got there. */
  events: v.number(),
});

/** The Email card's "Add summary to notes": the same summary, for this event only, awaited. */
export const addSummaryToEventNotes = action({
  args: { eventId: v.id("events") },
  returns: summaryButtonResult,
  handler: async (
    ctx,
    args,
  ): Promise<{ result: "written" | "nothing" | "no_invoice"; events: number }> => {
    await ctx.runQuery(internal.bookingSummary.requireSummaryAccess, { eventId: args.eventId });
    const outcome = await summarizeBooking(ctx, { eventId: args.eventId });
    if (outcome.status === "failed") {
      console.error(`[bookingSummary] event ${args.eventId}: ${outcome.reason}`);
      appError(
        "BOOKING_SUMMARY_FAILED",
        outcome.userMessage ??
          (outcome.retryable
            ? "The summary service is busy. Try again in a minute."
            : `Could not write the summary: ${outcome.reason}`),
      );
    }
    if (outcome.status === "written") return { result: "written", events: outcome.events };
    return { result: outcome.status, events: 0 };
  },
});
