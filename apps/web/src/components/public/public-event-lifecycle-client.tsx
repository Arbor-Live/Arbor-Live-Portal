"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { PublicPortalPageSkeleton } from "@/components/public/public-skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PublicPortalTabs, type PublicPortalTab } from "@/components/public/public-portal-tabs";
import {
  PublicPortalNextSteps,
  derivePortalNextSteps,
} from "@/components/public/public-portal-next-steps";
import { PublicEventHeader } from "@/components/public/public-event-header";
import { PublicEventTimetable } from "@/components/public/public-event-timetable";
import { PublicEventCrew } from "@/components/public/public-event-crew";
import { PublicEventContacts, buildInheritedContactRows } from "@/components/public/public-event-contacts";
import { PublicQuoteFinancials } from "@/components/public/public-quote-financials";
import { PublicPaymentProofSection } from "@/components/public/public-payment-proof-section";
import { PublicPaymentContactsSection } from "@/components/public/public-payment-contacts-section";
import { PublicQuoteApprovalSection } from "@/components/public/public-quote-approval-section";
import { PublicQuoteChangeRequestSection } from "@/components/public/public-quote-change-request-section";
import { PublicInvoicePdfDownload } from "@/components/public/public-invoice-pdf-download";
import { PublicPostEventSection } from "@/components/public/public-post-event-section";
import { PublicStaffDashboardLinks } from "@/components/public/public-staff-dashboard-links";
import { PublicEventPosterSection } from "@/components/public/public-event-poster-section";
import { PublicEventArtists } from "@/components/public/public-artist-card";
import type { PublicQuoteApprovalFormValues } from "@/lib/validations/crew-availability";
import type { PublicPaymentContactsFormValues } from "@/lib/validations/crew-availability";

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

export function PublicEventLifecycleClient({ token }: { token: string }) {
  const data = useQuery(api.invoices.getPublicQuoteByToken, { token });
  const feedbackStatus = useQuery(api.eventFeedback.getStatusByToken, {
    portal: "quote",
    token,
  });
  const poster = useQuery(api.publicEventPoster.getByQuoteToken, { token });
  const recordQuoteView = useMutation(api.invoices.recordPublicQuoteView);
  const recordedQuoteView = useRef(false);
  const approve = useMutation(api.invoices.approveByToken);
  const requestChanges = useMutation(api.invoices.requestChangesByToken);
  const updatePaymentContacts = useMutation(api.invoices.updatePaymentContactsByToken);
  const addEventContact = useMutation(api.invoices.addEventContactByToken);
  const deleteEventContact = useMutation(api.invoices.deleteEventContactByToken);
  const submitPaymentProof = useMutation(api.paymentProof.submitByQuoteToken);

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "next";
    const hash = window.location.hash.replace(/^#/, "");
    if (hash === "feedback") return "after";
    return new URLSearchParams(window.location.search).get("tab") ?? "next";
  });
  const [selectedDay, setSelectedDay] = useState(0);

  useEffect(() => {
    if (!data || recordedQuoteView.current) return;
    recordedQuoteView.current = true;
    void recordQuoteView({ token });
  }, [data, recordQuoteView, token]);

  const selectTab = (id: string) => {
    setActiveTab(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id === "next") url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    url.hash = "";
    window.history.replaceState(null, "", url);
  };

  if (data === undefined) {
    return (
      <PublicSiteChrome>
        <PublicPortalPageSkeleton titleWidth="w-48" />
      </PublicSiteChrome>
    );
  }
  if (!data) {
    return (
      <PublicSiteChrome>
        <PublicPageHero title="Quote unavailable" subtitle="This link is invalid or has expired." />
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">This quote link is invalid or expired.</p>
        </div>
      </PublicSiteChrome>
    );
  }

  const linkedEvent = data.event;
  const events = data.events ?? [];
  const dayIndex = Math.min(selectedDay, Math.max(0, events.length - 1));
  const selectedEvent = events[dayIndex] ?? linkedEvent;
  const quoteLocked = data.invoice.clientApprovalStatus !== "pending";
  const showPaymentContacts =
    data.invoice.clientApprovalStatus === "approved" && !data.paymentProof?.paymentReceived;
  const heroSubtitle = linkedEvent
    ? `${linkedEvent.title} · ${quoteStatusLabel(data.invoice.clientApprovalStatus)}`
    : quoteStatusLabel(data.invoice.clientApprovalStatus);

  const payment = data.paymentProof;
  const eventEnded = feedbackStatus?.eventEnded ?? false;
  const feedbackSubmitted = feedbackStatus?.submitted ?? false;
  const needsPoster = Boolean(
    poster?.eligible &&
      !eventEnded &&
      poster.days.some(
        (day) => day.visibility === "public" && (!day.posterImageUrl || !day.caption?.trim()),
      ),
  );

  const steps = derivePortalNextSteps({
    declined: false,
    finalized: false,
    quoteReady: true,
    approvalStatus: data.invoice.clientApprovalStatus,
    payment: {
      canSubmit: Boolean(payment?.canSubmit),
      submitted: Boolean(payment?.submission),
      received: Boolean(payment?.paymentReceived),
    },
    eventEnded,
    eventTitle: linkedEvent?.title,
    feedbackSubmitted,
    albumShareUrl: feedbackStatus?.albumShareUrl,
    needsPoster,
  });

  const tabs: PublicPortalTab[] = [{ id: "next", label: "What's next" }];
  if (linkedEvent) tabs.push({ id: "event", label: "Event" });
  tabs.push({
    id: "quote",
    label: "Quote & payment",
    attention: data.invoice.clientApprovalStatus === "pending" || Boolean(payment?.canSubmit),
  });
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

  return (
    <PublicSiteChrome>
      <PublicPageHero
        title={`Quote ${data.invoice.invoiceNumber}`}
        subtitle={heroSubtitle}
        shaderBand
        actions={<PublicStaffDashboardLinks invoiceId={data.invoice._id} eventId={linkedEvent?.id} />}
      />
      <PublicPortalTabs tabs={tabs} activeTab={resolvedTab} onSelect={selectTab}>
        {resolvedTab === "next" ? (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <div className="space-y-4 lg:order-2">
              <h2 className="font-heading text-sm font-medium text-muted-foreground">
                Notification center
              </h2>
              <PublicPortalNextSteps steps={steps} onNavigate={selectTab} />
            </div>
            <div className="space-y-4 lg:order-1">
              <h2 className="font-heading text-sm font-medium text-muted-foreground">
                Quote details
              </h2>
              <Card>
                <CardContent className="space-y-2 text-sm">
                  <p>Issued: {data.invoice.issueDate}</p>
                  {data.invoice.clientGroupName ? <p>Host: {data.invoice.clientGroupName}</p> : null}
                  {data.invoice.clientContactName ? (
                    <p>Contact: {data.invoice.clientContactName}</p>
                  ) : null}
                  <PublicInvoicePdfDownload
                    token={token}
                    portal="quote"
                    invoiceNumber={data.invoice.invoiceNumber}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {resolvedTab === "event" ? (
          selectedEvent ? (
            <>
              {events.length > 1 ? (
                <div role="tablist" aria-label="Event day" className="flex flex-wrap gap-2">
                  {events.map((event, index) => (
                    <Button
                      key={event.id}
                      type="button"
                      role="tab"
                      size="sm"
                      variant={index === dayIndex ? "default" : "outline"}
                      aria-selected={index === dayIndex}
                      onClick={() => setSelectedDay(index)}
                    >
                      Day {index + 1}
                    </Button>
                  ))}
                </div>
              ) : null}
              <PublicEventHeader
                title={selectedEvent.title}
                eventType={selectedEvent.eventType ?? undefined}
                venueName={selectedEvent.venueName ?? undefined}
                host={selectedEvent.host ?? undefined}
                startAt={selectedEvent.startAt}
                endAt={selectedEvent.endAt}
                status={selectedEvent.status}
              />
              <PublicEventPosterSection
                portal="quote"
                token={token}
                dayIndex={dayIndex}
                hideDayTabs
              />
              <PublicEventArtists
                artists={selectedEvent.artists}
                tbdSlots={selectedEvent.tbdArtistSlots ?? 0}
              />
              <PublicEventContacts
                manager={selectedEvent.contacts.manager}
                dayOfLead={selectedEvent.contacts.dayOfLead}
                inherited={buildInheritedContactRows(selectedEvent.contacts)}
                manual={selectedEvent.contacts.manual}
                canEdit={data.invoice.clientApprovalStatus === "approved"}
                onAdd={async (input) => {
                  await addEventContact({ token, eventId: selectedEvent.id, ...input });
                }}
                onDelete={async (contactId) => {
                  await deleteEventContact({ token, eventId: selectedEvent.id, contactId });
                }}
              />
              <PublicEventTimetable blocks={selectedEvent.scheduleBlocks} />
              <PublicEventCrew crew={selectedEvent.crewRoster} />
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Event Details</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                This quote is not linked to an event yet. Schedule and operations details will
                appear once linked.
              </CardContent>
            </Card>
          )
        ) : null}

        {resolvedTab === "quote" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className="space-y-4 lg:order-2 lg:sticky lg:top-24">
              <Card>
                <CardHeader>
                  <CardTitle>Quote details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>Issued: {data.invoice.issueDate}</p>
                  {data.invoice.clientGroupName ? <p>Host: {data.invoice.clientGroupName}</p> : null}
                  {data.invoice.clientContactName ? (
                    <p>Contact: {data.invoice.clientContactName}</p>
                  ) : null}
                  <PublicInvoicePdfDownload
                    token={token}
                    portal="quote"
                    invoiceNumber={data.invoice.invoiceNumber}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4 lg:order-1">
              <PublicQuoteFinancials
                lineItems={data.lineItems}
                totals={{
                  equipmentSubtotalUsd: data.invoice.equipmentSubtotalUsd,
                  externalRentalsSubtotalUsd: data.invoice.externalRentalsSubtotalUsd,
                  artistsSubtotalUsd: data.invoice.artistsSubtotalUsd,
                  crewSubtotalUsd: data.invoice.crewSubtotalUsd,
                  feesSubtotalUsd: data.invoice.feesSubtotalUsd,
                  subtotalUsd: data.invoice.subtotalUsd,
                  discountAmountUsd: data.invoice.discountAmountUsd,
                  totalUsd: data.invoice.totalUsd,
                }}
              />

              {data.invoice.notes ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Quote Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm whitespace-pre-wrap">
                    {data.invoice.notes}
                  </CardContent>
                </Card>
              ) : null}

              <PublicQuoteApprovalSection
                invoice={data.invoice}
                termsAndConditionsMarkdown={data.termsAndConditionsMarkdown}
                termsVersion={data.termsVersion}
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
                  key={data.invoice._id}
                  contacts={data.invoice}
                  onSave={handleSavePaymentContacts}
                />
              ) : null}

              {data.paymentProof ? (
                <PublicPaymentProofSection
                  token={token}
                  paymentProof={data.paymentProof}
                  submitMutation={submitPaymentProof}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {resolvedTab === "after" ? <PublicPostEventSection portal="quote" token={token} /> : null}
      </PublicPortalTabs>
    </PublicSiteChrome>
  );
}
