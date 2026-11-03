import { v } from "convex/values";
import {
  emailSummaryLabelDate,
  renderEmailSummaryBlock,
  upsertEmailSummaryBlock,
} from "@arbor/format";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
  /** When the client approved the quote, if they have. */
  approvedAt: v.union(v.number(), v.null()),
});

/**
 * Everything one summary needs, read in one transaction: the newest messages
 * (oldest first), the events to write to, and the approval date for the label.
 * An invoice target writes to every event linked to it; an event target to
 * that event only.
 */
export const loadSummaryInput = internalQuery({
  args: { target: summaryTarget },
  returns: summaryInputValue,
  handler: async (ctx, { target }) => {
    const refs = await resolveBookingRefs(ctx, target);
    const [thread, invoice, linkedEvents] = await Promise.all([
      findThreadForBooking(ctx, refs),
      refs.invoiceId ? ctx.db.get(refs.invoiceId) : null,
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
      approvedAt:
        invoice && (invoice.clientApprovalStatus ?? "pending") === "approved"
          ? (invoice.approvedAt ?? null)
          : null,
    };
  },
});

/**
 * Store the bullets on the thread and put them in each event's notes, replacing
 * the block a previous approval wrote. Staff text around the block is untouched.
 */
export const writeSummary = internalMutation({
  args: {
    threadId: v.id("emailThreads"),
    eventIds: v.array(v.id("events")),
    bullets: v.array(v.string()),
    label: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.threadId, { summaryBullets: args.bullets, summaryUpdatedAt: now });
    const block = renderEmailSummaryBlock(args.label, args.bullets);
    let written = 0;
    for (const eventId of args.eventIds) {
      const event = await ctx.db.get(eventId);
      if (!event) continue;
      await ctx.db.patch(eventId, {
        notes: upsertEmailSummaryBlock(event.notes, block),
        updatedAt: now,
      });
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

type SummaryOutcome =
  | { status: "written"; events: number }
  | { status: "nothing" }
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
  if (input.eventIds.length === 0) return { status: "nothing" };

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
      ? `quote approved ${emailSummaryLabelDate(input.approvedAt)}`
      : `as of ${emailSummaryLabelDate(Date.now())}`;
  const events = await ctx.runMutation(internal.bookingSummary.writeSummary, {
    threadId: input.threadId,
    eventIds: input.eventIds,
    bullets: kept,
    label,
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
      console.log(`[bookingSummary] invoice ${args.invoiceId}: ${outcome.status}`);
    }
    return null;
  },
});

/** The Email card's "Add summary to notes": the same summary, for this event only, awaited. */
export const addSummaryToEventNotes = action({
  args: { eventId: v.id("events") },
  returns: v.object({ result: v.union(v.literal("added"), v.literal("nothing")) }),
  handler: async (ctx, args): Promise<{ result: "added" | "nothing" }> => {
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
    return { result: outcome.status === "written" ? "added" : "nothing" };
  },
});
