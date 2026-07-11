"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatUsd } from "@/lib/format";
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
  const approve = useMutation(api.invoices.approveByToken);
  const requestChanges = useMutation(api.invoices.requestChangesByToken);
  const updatePaymentContacts = useMutation(api.invoices.updatePaymentContactsByToken);
  const submitPaymentProof = useMutation(api.paymentProof.submitByQuoteToken);

  if (data === undefined) {
    return (
      <PublicSiteChrome>
        <PublicPageHero title="Your quote" subtitle="Loading event and quote details…" />
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">Loading quote…</p>
        </div>
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
  const quoteLocked = data.invoice.clientApprovalStatus !== "pending";
  const showPaymentContacts =
    data.invoice.clientApprovalStatus === "approved" && !data.paymentProof?.paymentReceived;
  const heroSubtitle = linkedEvent
    ? `${linkedEvent.title} · ${quoteStatusLabel(data.invoice.clientApprovalStatus)}`
    : quoteStatusLabel(data.invoice.clientApprovalStatus);

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
      <PublicPageHero title={`Quote ${data.invoice.invoiceNumber}`} subtitle={heroSubtitle} />
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-12 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Quote {data.invoice.invoiceNumber}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Issued: {data.invoice.issueDate}</p>
            {data.invoice.clientGroupName ? <p>Group: {data.invoice.clientGroupName}</p> : null}
            {data.invoice.clientContactName ? <p>Contact: {data.invoice.clientContactName}</p> : null}
            <p className="text-base font-semibold">Total: {formatUsd(data.invoice.totalUsd)}</p>
            <p className="text-muted-foreground">
              {quoteStatusLabel(data.invoice.clientApprovalStatus)}
            </p>
            <PublicInvoicePdfDownload
              token={token}
              portal="quote"
              invoiceNumber={data.invoice.invoiceNumber}
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
            <PublicEventContacts manager={linkedEvent.contacts.manager} dayOfLead={linkedEvent.contacts.dayOfLead} />
            <PublicEventSchedule blocks={linkedEvent.scheduleBlocks} />
            <PublicEventCrew crew={linkedEvent.crewRoster} />
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Event Details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              This quote is not linked to an event yet. Schedule and operations details will appear once linked.
            </CardContent>
          </Card>
        )}

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
            <CardContent className="text-sm whitespace-pre-wrap">{data.invoice.notes}</CardContent>
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
    </PublicSiteChrome>
  );
}
