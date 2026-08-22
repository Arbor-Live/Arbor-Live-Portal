import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { syncLinkedEventStatusFromInvoice } from "./eventStatus";
import { listEventsByInvoiceId } from "./invoiceEvents";
import { toDocumentLineItem, recomputeInvoiceTotalsFromDocumentLines } from "./invoiceDocumentBuild";
import { resolveBillableOccurrenceCount } from "./invoiceSeries";
import { loadPaymentProofState, normalizeFinanceContactEmail } from "./paymentProof";
import { recordInvoiceStatusTransition } from "./statusTransitions";
import {
  markPayingPartyNotified,
  schedulePayingPartyAddedEmail,
  shouldNotifyPayingParty,
} from "../email/payingPartyEmails";

function resolveInvoiceTermsIds(invoice: Doc<"invoices">): Id<"invoiceTerms">[] {
  if (invoice.termsIds && invoice.termsIds.length > 0) return invoice.termsIds;
  if (invoice.termsId) return [invoice.termsId];
  return [];
}

function combineTermsMarkdown(terms: Doc<"invoiceTerms">[]) {
  if (!terms.length) return "";
  if (terms.length === 1) return terms[0].markdown;
  return terms.map((term) => `## ${term.label} (${term.version})\n\n${term.markdown}`).join("\n\n---\n\n");
}

export async function loadInvoiceTerms(ctx: QueryCtx | MutationCtx, invoice: Doc<"invoices">) {
  const fallbackSettings = await ctx.db
    .query("invoiceSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
  const termsIds = resolveInvoiceTermsIds(invoice);
  if (!termsIds.length) {
    return {
      markdown: fallbackSettings?.termsAndConditionsMarkdown ?? "",
      version: fallbackSettings?.termsVersion ?? "v1",
    };
  }

  const selectedTerms = (
    await Promise.all(termsIds.map((termsId) => ctx.db.get(termsId)))
  ).filter((term): term is Doc<"invoiceTerms"> => term !== null);

  if (!selectedTerms.length) {
    return {
      markdown: fallbackSettings?.termsAndConditionsMarkdown ?? "",
      version: fallbackSettings?.termsVersion ?? "v1",
    };
  }

  return {
    markdown: combineTermsMarkdown(selectedTerms),
    version: selectedTerms.map((term) => term.version).join(", "),
  };
}

export async function loadPublicQuoteView(ctx: QueryCtx, invoice: Doc<"invoices">) {
  const lineItems = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", invoice._id))
    .take(500);
  const { markdown: globalTermsMarkdown, version: globalTermsVersion } = await loadInvoiceTerms(ctx, invoice);
  const combinedTermsMarkdown = invoice.additionalTermsMarkdown
    ? `${globalTermsMarkdown}\n\n---\n\n## Additional Terms\n\n${invoice.additionalTermsMarkdown}`
    : globalTermsMarkdown;
  const linkedEvents = await listEventsByInvoiceId(ctx, invoice._id);
  const linkedEvent = linkedEvents[0] ?? null;
  const paymentProof = await loadPaymentProofState(ctx, invoice, linkedEvent);
  const billableOccurrenceCount = await resolveBillableOccurrenceCount(ctx, invoice._id);
  const documentLineItems = lineItems.map((row) => {
    const doc = toDocumentLineItem(row, billableOccurrenceCount);
    return doc;
  });
  const displayTotals = recomputeInvoiceTotalsFromDocumentLines(documentLineItems, {
    discountType: invoice.discountType,
    discountValue: invoice.discountValue,
  });
  const displayLineItems = lineItems.map((row, index) => {
    const doc = documentLineItems[index]!;
    return {
      ...row,
      quantity: doc.quantity,
      quantityDetail: doc.quantityDetail,
      amountUsd: doc.amountUsd,
    };
  });
  const eventIds = linkedEvents.map((event) => event._id);
  const eventAssignments = linkedEvent
    ? (
        await Promise.all(
          eventIds.map((eventId) =>
            ctx.db
              .query("eventPeopleAssignments")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .take(500),
          ),
        )
      ).flat()
    : [];
  const eventScheduleBlocks = linkedEvent
    ? (
        await Promise.all(
          eventIds.map((eventId) =>
            ctx.db
              .query("eventScheduleBlocks")
              .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
              .take(500),
          ),
        )
      ).flat()
    : [];
  const eventShifts = linkedEvent
    ? (
        await Promise.all(
          eventIds.map((eventId) =>
            ctx.db
              .query("eventCrewShifts")
              .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
              .take(500),
          ),
        )
      ).flat()
    : [];
  const eventArtifacts = linkedEvent
    ? (
        await Promise.all(
          eventIds.map((eventId) =>
            ctx.db
              .query("eventArtifacts")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .take(500),
          ),
        )
      ).flat()
    : [];

  return {
    invoice: {
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      managerName: invoice.managerName,
      managerEmail: invoice.managerEmail,
      clientGroupName: invoice.clientGroupName,
      clientContactName: invoice.clientContactName,
      clientEmail: invoice.clientEmail,
      clientPhone: invoice.clientPhone,
      clientAddressLine1: invoice.clientAddressLine1,
      clientAddressLine2: invoice.clientAddressLine2,
      clientCity: invoice.clientCity,
      clientState: invoice.clientState,
      clientPostalCode: invoice.clientPostalCode,
      notes: invoice.notes,
      ...displayTotals,
      clientApprovalStatus: invoice.clientApprovalStatus ?? "pending",
      approvedAt: invoice.approvedAt,
      changesRequestedAt: invoice.changesRequestedAt,
      clientApprovalSignedName: invoice.clientApprovalSignedName,
      clientIsPaymentSubmitter: invoice.clientIsPaymentSubmitter,
      paymentSubmitterName: invoice.paymentSubmitterName,
      paymentSubmitterEmail: invoice.paymentSubmitterEmail,
      termsVersionAccepted: invoice.termsVersionAccepted,
      termsAcceptedAt: invoice.termsAcceptedAt,
      termsIds: resolveInvoiceTermsIds(invoice),
      additionalTermsMarkdown: invoice.additionalTermsMarkdown,
    },
    lineItems: displayLineItems,
    termsAndConditionsMarkdown: combinedTermsMarkdown,
    termsVersion: globalTermsVersion,
    event: linkedEvent
      ? (() => {
          const eventManagerAssignment = eventAssignments.find((row) => row.assignmentType === "event_manager");
          const dayOfLeadAssignment = eventAssignments.find((row) => row.assignmentType === "day_of_lead");
          const crewAssignments = eventAssignments.filter((row) => row.assignmentType === "crew");
          return {
            id: linkedEvent._id,
            title: linkedEvent.title,
            status: linkedEvent.status,
            venueName: linkedEvent.venueName,
            eventType: linkedEvent.eventType,
            host: linkedEvent.host,
            startAt: linkedEvent.startAt,
            endAt: linkedEvent.endAt,
            assignments: eventAssignments,
            scheduleBlocks: eventScheduleBlocks,
            contacts: {
              manager: {
                name: eventManagerAssignment?.personName ?? invoice.managerName,
                email: eventManagerAssignment?.contactEmail ?? invoice.managerEmail ?? undefined,
                phone: eventManagerAssignment?.contactPhone ?? undefined,
              },
              dayOfLead: dayOfLeadAssignment
                ? {
                    name: dayOfLeadAssignment.personName,
                    email: dayOfLeadAssignment.contactEmail ?? undefined,
                    phone: dayOfLeadAssignment.contactPhone ?? undefined,
                  }
                : null,
            },
            crewRoster: crewAssignments.map((row) => ({
              name: row.personName,
              role: row.roleLabel ?? undefined,
              email: row.contactEmail ?? undefined,
            })),
            shifts: eventShifts,
            artifacts: eventArtifacts,
          };
        })()
      : null,
    paymentProof,
  };
}

export async function incrementPublicQuoteView(ctx: MutationCtx, invoice: Doc<"invoices">) {
  const now = Date.now();
  await ctx.db.patch(invoice._id, {
    publicQuoteLastOpenedAt: now,
    publicQuoteOpenCount: (invoice.publicQuoteOpenCount ?? 0) + 1,
    updatedAt: now,
  });
}

function normalizeSignedName(raw: string) {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2) throw new Error("Type your full name to electronically sign.");
  return trimmed;
}

export type QuoteApprovalDetails = {
  signedName: string;
  clientIsPaymentSubmitter: boolean;
  paymentSubmitterName?: string;
  paymentSubmitterEmail?: string;
};

export async function approveInvoiceQuote(
  ctx: MutationCtx,
  invoice: Doc<"invoices">,
  details: QuoteApprovalDetails,
) {
  if (invoice.status === "void") throw new Error("Quote not found.");
  if ((invoice.clientApprovalStatus ?? "pending") !== "pending") {
    throw new Error("Quote decision already submitted.");
  }

  const signedName = normalizeSignedName(details.signedName);
  const clientIsPaymentSubmitter = details.clientIsPaymentSubmitter;
  let paymentSubmitterName: string | undefined;
  let paymentSubmitterEmail: string | undefined;

  if (clientIsPaymentSubmitter) {
    paymentSubmitterName = signedName;
    paymentSubmitterEmail = normalizeFinanceContactEmail(invoice.clientEmail);
  } else {
    paymentSubmitterName = details.paymentSubmitterName?.trim();
    if (!paymentSubmitterName) {
      throw new Error("Enter the Financial Officer or Paying party name.");
    }
    paymentSubmitterEmail = normalizeFinanceContactEmail(details.paymentSubmitterEmail);
    if (!paymentSubmitterEmail) {
      throw new Error("Enter the Financial Officer or Paying party email.");
    }
  }

  const now = Date.now();
  const fromStatus = invoice.clientApprovalStatus ?? "pending";
  const { version: termsVersion } = await loadInvoiceTerms(ctx, invoice);
  await ctx.db.patch(invoice._id, {
    clientApprovalStatus: "approved",
    approvedAt: now,
    clientApprovalSignedName: signedName,
    clientIsPaymentSubmitter,
    paymentSubmitterName,
    paymentSubmitterEmail,
    paymentFinanceContactEmail: undefined,
    termsAcceptedAt: now,
    termsVersionAccepted: termsVersion,
    updatedAt: now,
  });
  await recordInvoiceStatusTransition(ctx, invoice._id, fromStatus, "approved", { at: now });
  await syncLinkedEventStatusFromInvoice(ctx, invoice._id, "approved");

  if (!clientIsPaymentSubmitter && paymentSubmitterEmail) {
    await schedulePayingPartyAddedEmail(ctx, {
      invoice,
      payingPartyEmail: paymentSubmitterEmail,
      payingPartyName: paymentSubmitterName,
      approvedByName: signedName,
      idempotencySuffix: String(now),
    });
    await markPayingPartyNotified(ctx, invoice._id, paymentSubmitterEmail);
  }
}

export async function updateInvoicePaymentContacts(
  ctx: MutationCtx,
  invoice: Doc<"invoices">,
  args: {
    clientIsPaymentSubmitter?: boolean;
    paymentSubmitterName?: string;
    paymentSubmitterEmail?: string;
  },
) {
  if (invoice.status === "void") throw new Error("Quote not found.");
  if ((invoice.clientApprovalStatus ?? "pending") !== "approved") {
    throw new Error("Payment submitter can be updated after the quote is approved.");
  }

  const patch: Partial<Doc<"invoices">> = {
    updatedAt: Date.now(),
    paymentFinanceContactEmail: undefined,
  };
  const previousPayingPartyEmail = invoice.clientIsPaymentSubmitter
    ? undefined
    : invoice.paymentSubmitterEmail?.trim().toLowerCase();

  if (args.clientIsPaymentSubmitter !== undefined) {
    patch.clientIsPaymentSubmitter = args.clientIsPaymentSubmitter;
    if (args.clientIsPaymentSubmitter) {
      patch.paymentSubmitterName = invoice.clientApprovalSignedName ?? invoice.clientContactName;
      patch.paymentSubmitterEmail = normalizeFinanceContactEmail(invoice.clientEmail);
    } else {
      const name = args.paymentSubmitterName?.trim();
      if (!name) throw new Error("Enter the Financial Officer or Paying party name.");
      patch.paymentSubmitterName = name;
      patch.paymentSubmitterEmail = normalizeFinanceContactEmail(args.paymentSubmitterEmail);
      if (!patch.paymentSubmitterEmail) {
        throw new Error("Enter the Financial Officer or Paying party email.");
      }
    }
  } else if (args.paymentSubmitterName !== undefined || args.paymentSubmitterEmail !== undefined) {
    if (invoice.clientIsPaymentSubmitter) {
      throw new Error('Check "I will be submitting the payment" to update your own contact details.');
    }
    if (args.paymentSubmitterName !== undefined) {
      const name = args.paymentSubmitterName.trim();
      if (!name) throw new Error("Enter the Financial Officer or Paying party name.");
      patch.paymentSubmitterName = name;
    }
    if (args.paymentSubmitterEmail !== undefined) {
      patch.paymentSubmitterEmail = normalizeFinanceContactEmail(args.paymentSubmitterEmail);
      if (!patch.paymentSubmitterEmail) {
        throw new Error("Enter the Financial Officer or Paying party email.");
      }
    }
  }

  await ctx.db.patch(invoice._id, patch);

  const nextClientIsPaymentSubmitter = patch.clientIsPaymentSubmitter ?? invoice.clientIsPaymentSubmitter;
  const nextPayingPartyEmail = patch.paymentSubmitterEmail ?? invoice.paymentSubmitterEmail;
  const nextPayingPartyName = patch.paymentSubmitterName ?? invoice.paymentSubmitterName;
  const normalizedNextEmail = nextPayingPartyEmail?.trim().toLowerCase();

  if (
    shouldNotifyPayingParty({
      nextClientIsPaymentSubmitter,
      nextPayingPartyEmail: normalizedNextEmail,
      previousPayingPartyEmail: previousPayingPartyEmail,
      notifiedEmail: invoice.payingPartyNotifiedEmail,
    })
  ) {
    await schedulePayingPartyAddedEmail(ctx, {
      invoice,
      payingPartyEmail: normalizedNextEmail!,
      payingPartyName: nextPayingPartyName,
      approvedByName: invoice.clientApprovalSignedName ?? invoice.clientContactName ?? "The client",
      idempotencySuffix: String(patch.updatedAt),
    });
    await markPayingPartyNotified(ctx, invoice._id, normalizedNextEmail!);
  }
}

export async function requestInvoiceQuoteChanges(
  ctx: MutationCtx,
  invoice: Doc<"invoices">,
  note: string,
) {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("Please include a note.");
  if (invoice.status === "void") throw new Error("Quote not found.");
  if ((invoice.clientApprovalStatus ?? "pending") !== "pending") {
    throw new Error("Quote decision already submitted.");
  }

  const now = Date.now();
  const fromStatus = invoice.clientApprovalStatus ?? "pending";
  await ctx.db.patch(invoice._id, {
    clientApprovalStatus: "changes_requested",
    changesRequestedAt: now,
    clientApprovalNote: trimmed,
    updatedAt: now,
  });
  await recordInvoiceStatusTransition(ctx, invoice._id, fromStatus, "changes_requested", { at: now });
  await syncLinkedEventStatusFromInvoice(ctx, invoice._id, "changes_requested");
}
