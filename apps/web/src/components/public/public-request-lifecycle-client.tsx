"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { PublicPortalPageSkeleton } from "@/components/public/public-skeletons";
import { PublicPortalTabs, type PublicPortalTab } from "@/components/public/public-portal-tabs";
import {
  PublicPortalNextSteps,
  derivePortalNextSteps,
} from "@/components/public/public-portal-next-steps";
import { PublicEventHeader } from "@/components/public/public-event-header";
import { PublicEventTimetable } from "@/components/public/public-event-timetable";
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
import { formatDateTime } from "@/lib/format";
import { ARBOR_CONTACT_EMAIL } from "@/lib/landing-content";
import type {
  PublicPaymentContactsFormValues,
  PublicQuoteApprovalFormValues,
} from "@/lib/validations/crew-availability";

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
      active:
        (request.status === "action_required" || request.status === "in_review") &&
        !quoteReady &&
        !quoteApproved,
    },
    {
      key: "approved",
      label: "Quote approved — logistics planning",
      complete: quoteApproved,
      active: (quoteReady || request.status === "pending_client") && !quoteApproved,
    },
  ];
}

export function PublicRequestLifecycleClient({ token }: { token: string }) {
  const request = useQuery(api.eventRequests.getPublicRequestByToken, { token });
  const quoteData = useQuery(api.eventRequests.getPublicRequestQuoteByToken, { token });
  const feedbackStatus = useQuery(api.eventFeedback.getStatusByToken, {
    portal: "request",
    token,
  });
  const recordQuoteView = useMutation(api.eventRequests.recordPublicQuoteViewByRequestToken);
  const recordedQuoteView = useRef(false);
  const approve = useMutation(api.eventRequests.approveQuoteByRequestToken);
  const requestChanges = useMutation(api.eventRequests.requestQuoteChangesByRequestToken);
  const updatePaymentContacts = useMutation(api.eventRequests.updatePaymentContactsByRequestToken);
  const submitPaymentProof = useMutation(api.paymentProof.submitByRequestToken);

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "next";
    const hash = window.location.hash.replace(/^#/, "");
    if (hash === "feedback") return "after";
    return new URLSearchParams(window.location.search).get("tab") ?? "next";
  });

  useEffect(() => {
    if (!quoteData || recordedQuoteView.current) return;
    recordedQuoteView.current = true;
    void recordQuoteView({ token });
  }, [quoteData, recordQuoteView, token]);

  const selectTab = (id: string) => {
    setActiveTab(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id === "next") url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    url.hash = "";
    window.history.replaceState(null, "", url);
  };

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

  const approvalStatus =
    quoteData?.invoice.clientApprovalStatus ?? request.quote?.clientApprovalStatus ?? "pending";
  const payment = quoteData?.paymentProof;
  const eventEnded = feedbackStatus?.eventEnded ?? false;
  const feedbackSubmitted = feedbackStatus?.submitted ?? false;

  const steps = derivePortalNextSteps({
    declined: isDeclined,
    finalized: isQuoteVoided,
    quoteReady: Boolean(quoteData),
    approvalStatus,
    payment: {
      canSubmit: Boolean(payment?.canSubmit),
      submitted: Boolean(payment?.submission),
      received: Boolean(payment?.paymentReceived),
    },
    eventEnded,
    eventTitle: linkedEvent?.title ?? request.eventName ?? undefined,
    feedbackSubmitted,
    albumShareUrl: feedbackStatus?.albumShareUrl,
  });

  const tabs: PublicPortalTab[] = [{ id: "next", label: "What's next" }];
  if (linkedEvent) tabs.push({ id: "event", label: "Event" });
  if (quoteData && !isQuoteVoided) {
    tabs.push({
      id: "quote",
      label: "Quote & payment",
      attention: approvalStatus === "pending" || Boolean(payment?.canSubmit),
    });
  }
  if (eventEnded) {
    tabs.push({ id: "after", label: "After the event", attention: !feedbackSubmitted });
  }
  const resolvedTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : "next";

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
      <PublicPortalTabs tabs={tabs} activeTab={resolvedTab} onSelect={selectTab}>
        {resolvedTab === "next" ? (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <div className="space-y-3 lg:order-2">
              <h2 className="font-heading text-sm font-medium text-muted-foreground">
                Notification center
              </h2>
              <PublicPortalNextSteps steps={steps} onNavigate={selectTab} />
            </div>
            <div className="space-y-4 lg:order-1">
            <Card>
              <CardContent className="space-y-3 text-sm">
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
                {request.expectedTurnout >= 200 && !isFinalized ? (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-800">
                    Campus sensation ({request.expectedTurnout} guests). Our team will follow up with
                    extra coordination steps.
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
                      This quote has been voided and the request is finalized. If you&apos;d like to
                      get in touch or submit a new booking request, email{" "}
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
                        <span
                          className={step.complete || step.active ? "font-medium" : "text-muted-foreground"}
                        >
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
                      <span
                        className={step.complete || step.active ? "font-medium" : "text-muted-foreground"}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {!isQuoteVoided && !linkedEvent ? (
              <PublicEventPosterSection portal="request" token={token} />
            ) : null}
            </div>
          </div>
        ) : null}

        {resolvedTab === "event" && linkedEvent ? (
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
            <PublicEventTimetable blocks={linkedEvent.scheduleBlocks} />
            <PublicEventCrew crew={linkedEvent.crewRoster} />
          </>
        ) : null}

        {resolvedTab === "quote" ? (
          quoteData && !isQuoteVoided ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <div className="space-y-4 lg:order-2 lg:sticky lg:top-24">
                <Card>
                  <CardHeader>
                    <CardTitle>Quote details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>Issued: {quoteData.invoice.issueDate}</p>
                    {quoteData.invoice.clientGroupName ? (
                      <p>Host: {quoteData.invoice.clientGroupName}</p>
                    ) : null}
                    {quoteData.invoice.clientContactName ? (
                      <p>Contact: {quoteData.invoice.clientContactName}</p>
                    ) : null}
                    <PublicInvoicePdfDownload
                      token={token}
                      portal="request"
                      invoiceNumber={quoteData.invoice.invoiceNumber}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4 lg:order-1">
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
                    <CardContent className="text-sm whitespace-pre-wrap">
                      {quoteData.invoice.notes}
                    </CardContent>
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
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Your quote is being prepared. You will see the full quote here when it is ready for
                review.
              </CardContent>
            </Card>
          )
        ) : null}

        {resolvedTab === "after" ? <PublicPostEventSection portal="request" token={token} /> : null}
      </PublicPortalTabs>
    </PublicSiteChrome>
  );
}
