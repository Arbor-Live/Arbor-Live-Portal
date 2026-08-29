"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { PublicPortalPageSkeleton } from "@/components/public/public-skeletons";
import { PublicEventHeader } from "@/components/public/public-event-header";
import { PublicEventSchedule } from "@/components/public/public-event-schedule";
import { PublicEventCrew } from "@/components/public/public-event-crew";
import { PublicEventContacts } from "@/components/public/public-event-contacts";
import { PublicQuoteFinancials } from "@/components/public/public-quote-financials";
import { PublicPaymentProofSection } from "@/components/public/public-payment-proof-section";
import { PublicPaymentContactsSection } from "@/components/public/public-payment-contacts-section";
import { PublicQuoteApprovalSection } from "@/components/public/public-quote-approval-section";
import { PublicQuoteChangeRequestSection } from "@/components/public/public-quote-change-request-section";
import { PublicInvoicePdfDownload } from "@/components/public/public-invoice-pdf-download";
import { PublicPostEventSection } from "@/components/public/public-post-event-section";
import { PublicStaffDashboardLinks } from "@/components/public/public-staff-dashboard-links";
import { PublicEventPosterSection } from "@/components/public/public-event-poster-section";
import { formatDateTime, formatUsd } from "@/lib/format";
import { ARBOR_CONTACT_EMAIL } from "@/lib/landing-content";
import type {
  PublicPaymentContactsFormValues,
  PublicQuoteApprovalFormValues,
} from "@/lib/validations/crew-availability";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  converted: "Quote in progress",
  declined: "Declined",
};

type LifecycleStep = {
  key: string;
  label: string;
  complete: boolean;
  active: boolean;
};

function buildLifecycleSteps(request: {
  status: string;
  quote?: {
    status: "draft" | "finalized" | "void";
    readyForClientReview: boolean;
    clientApprovalStatus: "pending" | "approved" | "changes_requested";
  };
}): LifecycleStep[] {
  if (request.status === "declined") {
    return [{ key: "declined", label: "Request declined", complete: true, active: true }];
  }

  if (request.quote?.status === "void") {
    return [
      { key: "submitted", label: "Request received", complete: true, active: false },
      { key: "voided", label: "Quote voided — request finalized", complete: true, active: true },
    ];
  }

  const quoteReady = request.quote?.readyForClientReview ?? false;
  const quoteApproved = request.quote?.clientApprovalStatus === "approved";

  return [
    {
      key: "submitted",
      label: "Request received",
      complete: true,
      active: request.status === "submitted",
    },
    {
      key: "quote",
      label: quoteReady ? "Quote ready for your review" : "Quote being prepared",
      complete: quoteReady || quoteApproved,
      active: request.status === "converted" && !quoteReady && !quoteApproved,
    },
    {
      key: "approved",
      label: "Quote approved — logistics planning",
      complete: quoteApproved,
      active: quoteReady && !quoteApproved,
    },
  ];
}

function quoteStatusLabel(status: "pending" | "approved" | "changes_requested") {
  switch (status) {
    case "approved":
      return "Approved";
    case "changes_requested":
      return "Changes requested";
    default:
      return "Awaiting your approval";
  }
}

export function PublicRequestLifecycleClient({ token }: { token: string }) {
  const request = useQuery(api.eventRequests.getPublicRequestByToken, { token });
  const quoteData = useQuery(api.eventRequests.getPublicRequestQuoteByToken, { token });
  const recordQuoteView = useMutation(api.eventRequests.recordPublicQuoteViewByRequestToken);
  const recordedQuoteView = useRef(false);
  const approve = useMutation(api.eventRequests.approveQuoteByRequestToken);
  const requestChanges = useMutation(api.eventRequests.requestQuoteChangesByRequestToken);
  const updatePaymentContacts = useMutation(api.eventRequests.updatePaymentContactsByRequestToken);
  const submitPaymentProof = useMutation(api.paymentProof.submitByRequestToken);

  useEffect(() => {
    if (!quoteData || recordedQuoteView.current) return;
    recordedQuoteView.current = true;
    void recordQuoteView({ token });
  }, [quoteData, recordQuoteView, token]);

  if (request === undefined) {
    return (
      <PublicSiteChrome>
        <PublicPortalPageSkeleton titleWidth="w-72" />
      </PublicSiteChrome>
    );
  }
  if (!request) {
    return (
      <PublicSiteChrome>
        <PublicPageHero title="Request unavailable" subtitle="This tracking link is invalid or has expired." />
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">This request link is invalid or expired.</p>
        </div>
      </PublicSiteChrome>
    );
  }

  const lifecycleSteps = buildLifecycleSteps(request);
  const isDeclined = request.status === "declined";
  const isQuoteVoided = request.quote?.status === "void";
  const isFinalized = isDeclined || isQuoteVoided;
  const quoteLocked = quoteData ? quoteData.invoice.clientApprovalStatus !== "pending" : false;
  const linkedEvent = quoteData?.event ?? null;
  const showPaymentContacts =
    quoteData?.invoice.clientApprovalStatus === "approved" && !quoteData.paymentProof?.paymentReceived;

  const handleApprove = async (values: PublicQuoteApprovalFormValues) => {
    await approve({
      token,
      signedName: values.signedName.trim(),
      clientIsPaymentSubmitter: values.clientIsPaymentSubmitter,
      paymentSubmitterName: values.clientIsPaymentSubmitter
        ? undefined
        : values.paymentSubmitterName?.trim(),
      paymentSubmitterEmail: values.clientIsPaymentSubmitter
        ? undefined
        : values.paymentSubmitterEmail?.trim() || undefined,
    });
  };

  const handleSavePaymentContacts = async (values: PublicPaymentContactsFormValues) => {
    await updatePaymentContacts({
      token,
      clientIsPaymentSubmitter: values.clientIsPaymentSubmitter,
      paymentSubmitterName: values.clientIsPaymentSubmitter
        ? undefined
        : values.paymentSubmitterName?.trim(),
      paymentSubmitterEmail: values.clientIsPaymentSubmitter
        ? undefined
        : values.paymentSubmitterEmail?.trim() || undefined,
    });
  };

  const statusLabel = isQuoteVoided
    ? "Finalized"
    : (STATUS_LABELS[request.status] ?? request.status);

  const heroSubtitle = isQuoteVoided
    ? "This quote has been voided. This request is finalized."
    : (request.eventName ??
      (request.quote?.readyForClientReview
        ? "Your quote is ready for review."
        : "Follow your request from submission through quote approval."));

  return (
    <PublicSiteChrome>
      <PublicPageHero
        title={`Request ${request.requestNumber}`}
        subtitle={heroSubtitle}
        shaderBand
        actions={
          <PublicStaffDashboardLinks
            requestId={request._id}
            invoiceId={request.linkedInvoiceId ?? quoteData?.invoice._id}
            eventId={request.convertedEventId ?? linkedEvent?.id}
          />
        }
      />
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-12 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Request {request.requestNumber}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Status:{" "}
            <span className="font-medium">{statusLabel}</span>
          </p>
          <p className="text-muted-foreground">
            Submitted {formatDateTime(request.submittedAt)}
          </p>
          <p>
            {request.firstName} {request.lastName} · {request.email}
          </p>
          {request.organization ? <p>Organization: {request.organization}</p> : null}
          <p>
            {request.eventName ? (
              <>
                <span className="font-medium">{request.eventName}</span>
                <span className="text-muted-foreground"> · {request.eventCategory}</span>
              </>
            ) : (
              request.eventCategory
            )}
            {" · "}
            {request.eventDateText}
          </p>
          {request.eventScheduleText ? (
            <p className="whitespace-pre-wrap">{request.eventScheduleText}</p>
          ) : (
            <p>
              {request.eventStartTimeText} – {request.eventEndTimeText}
            </p>
          )}
          {request.quote ? (
            <p>
              Quote {request.quote.invoiceNumber}
              {request.quote.status === "void"
                ? " · Voided"
                : request.quote.readyForClientReview
                  ? request.quote.clientApprovalStatus === "approved"
                    ? " · Approved"
                    : request.quote.clientApprovalStatus === "changes_requested"
                      ? " · Changes requested"
                      : " · Ready for your review"
                  : " · Being prepared"}
            </p>
          ) : null}
          {request.expectedTurnout >= 200 && !isFinalized ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-800">
              Campus sensation ({request.expectedTurnout} guests). Our team will follow up with extra
              coordination steps.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isDeclined ? (
            <p className="text-sm text-muted-foreground">
              This request was declined. Contact {ARBOR_CONTACT_EMAIL} if you have questions.
            </p>
          ) : isQuoteVoided ? (
            <>
              <p className="text-sm text-muted-foreground">
                This quote has been voided and the request is finalized. If you&apos;d like to get
                in touch or submit a new booking request, email{" "}
                <a
                  href={`mailto:${ARBOR_CONTACT_EMAIL}`}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  {ARBOR_CONTACT_EMAIL}
                </a>{" "}
                or{" "}
                <Link
                  href="/request"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  submit a new request
                </Link>
                .
              </p>
              {lifecycleSteps.map((step, index) => (
                <div key={step.key} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex size-6 items-center justify-center rounded-full border text-xs ${
                      step.complete
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className={step.complete || step.active ? "font-medium" : "text-muted-foreground"}>
                    {step.label}
                  </span>
                </div>
              ))}
            </>
          ) : (
            lifecycleSteps.map((step, index) => (
              <div key={step.key} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex size-6 items-center justify-center rounded-full border text-xs ${
                    step.complete
                      ? "border-primary bg-primary text-primary-foreground"
                      : step.active
                        ? "border-primary text-primary"
                        : "text-muted-foreground"
                  }`}
                >
                  {index + 1}
                </span>
                <span className={step.complete || step.active ? "font-medium" : "text-muted-foreground"}>
                  {step.label}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {!isQuoteVoided && !(quoteData && linkedEvent) ? (
        <PublicEventPosterSection portal="request" token={token} />
      ) : null}

      {quoteData && !isQuoteVoided ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Quote {quoteData.invoice.invoiceNumber}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Issued: {quoteData.invoice.issueDate}</p>
              {quoteData.invoice.clientGroupName ? (
                <p>Host: {quoteData.invoice.clientGroupName}</p>
              ) : null}
              {quoteData.invoice.clientContactName ? <p>Contact: {quoteData.invoice.clientContactName}</p> : null}
              <p className="text-base font-semibold">Total: {formatUsd(quoteData.invoice.totalUsd)}</p>
              <p className="text-muted-foreground">
                {quoteStatusLabel(quoteData.invoice.clientApprovalStatus)}
              </p>
              <PublicInvoicePdfDownload
                token={token}
                portal="request"
                invoiceNumber={quoteData.invoice.invoiceNumber}
              />
            </CardContent>
          </Card>

          {linkedEvent ? (
            <>
              <PublicEventHeader
                title={linkedEvent.title}
                eventType={linkedEvent.eventType ?? undefined}
                venueName={linkedEvent.venueName ?? undefined}
                host={linkedEvent.host ?? undefined}
                startAt={linkedEvent.startAt}
                endAt={linkedEvent.endAt}
                status={linkedEvent.status}
              />
              <PublicEventPosterSection portal="request" token={token} />
              <PublicEventContacts
                manager={linkedEvent.contacts.manager}
                dayOfLead={linkedEvent.contacts.dayOfLead}
              />
              <PublicEventSchedule blocks={linkedEvent.scheduleBlocks} />
              <PublicEventCrew crew={linkedEvent.crewRoster} />
            </>
          ) : null}

          <PublicQuoteFinancials
            lineItems={quoteData.lineItems}
            totals={{
              equipmentSubtotalUsd: quoteData.invoice.equipmentSubtotalUsd,
              externalRentalsSubtotalUsd: quoteData.invoice.externalRentalsSubtotalUsd,
              artistsSubtotalUsd: quoteData.invoice.artistsSubtotalUsd,
              crewSubtotalUsd: quoteData.invoice.crewSubtotalUsd,
              feesSubtotalUsd: quoteData.invoice.feesSubtotalUsd,
              subtotalUsd: quoteData.invoice.subtotalUsd,
              discountAmountUsd: quoteData.invoice.discountAmountUsd,
              totalUsd: quoteData.invoice.totalUsd,
            }}
          />

          {quoteData.invoice.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Quote Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{quoteData.invoice.notes}</CardContent>
            </Card>
          ) : null}

          <PublicQuoteApprovalSection
            invoice={quoteData.invoice}
            termsAndConditionsMarkdown={quoteData.termsAndConditionsMarkdown}
            termsVersion={quoteData.termsVersion}
            onApprove={handleApprove}
          />

          <PublicQuoteChangeRequestSection
            disabled={quoteLocked}
            onRequestChanges={async (note) => {
              await requestChanges({ token, note });
            }}
          />

          {showPaymentContacts ? (
            <PublicPaymentContactsSection
              key={quoteData.invoice._id}
              contacts={quoteData.invoice}
              onSave={handleSavePaymentContacts}
            />
          ) : null}

          {quoteData.paymentProof ? (
            <PublicPaymentProofSection
              token={token}
              paymentProof={quoteData.paymentProof}
              submitMutation={submitPaymentProof}
            />
          ) : null}

          <PublicPostEventSection portal="request" token={token} />
        </>
      ) : !isQuoteVoided && request.quote && !request.quote.readyForClientReview ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Your quote is being prepared. You will see the full quote here when it is ready for review.
          </CardContent>
        </Card>
      ) : null}
      </div>
    </PublicSiteChrome>
  );
}
