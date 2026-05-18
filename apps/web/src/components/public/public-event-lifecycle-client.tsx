"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicEventHeader } from "@/components/public/public-event-header";
import { PublicEventSchedule } from "@/components/public/public-event-schedule";
import { PublicEventCrew } from "@/components/public/public-event-crew";
import { PublicEventContacts } from "@/components/public/public-event-contacts";
import { PublicQuoteFinancials } from "@/components/public/public-quote-financials";
import { PublicQuoteTermsApproval } from "@/components/public/public-quote-terms-approval";

export function PublicEventLifecycleClient({ token }: { token: string }) {
  const data = useQuery(api.invoices.getPublicQuoteByToken, { token });
  const approve = useMutation(api.invoices.approveByToken);
  const requestChanges = useMutation(api.invoices.requestChangesByToken);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <PublicSiteChrome>
        <div className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">Loading quote...</div>
      </PublicSiteChrome>
    );
  }
  if (!data) {
    return (
      <PublicSiteChrome>
        <div className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">This quote link is invalid or expired.</div>
      </PublicSiteChrome>
    );
  }

  const locked = data.invoice.clientApprovalStatus !== "pending";
  const linkedEvent = data.event;

  return (
    <PublicSiteChrome>
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Quote {data.invoice.invoiceNumber}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Issued: {data.invoice.issueDate}</p>
            {data.invoice.clientGroupName ? <p>Group: {data.invoice.clientGroupName}</p> : null}
            {data.invoice.clientContactName ? <p>Contact: {data.invoice.clientContactName}</p> : null}
            <p className="text-base font-semibold">Total: ${data.invoice.totalUsd.toFixed(2)}</p>
            <p className="text-muted-foreground">Status: {data.invoice.clientApprovalStatus}</p>
            {data.invoice.clientApprovalNote ? <p>Change request note: {data.invoice.clientApprovalNote}</p> : null}
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

        <PublicQuoteTermsApproval
          termsAndConditionsMarkdown={data.termsAndConditionsMarkdown}
          termsVersion={data.termsVersion}
          acceptTerms={acceptTerms}
          setAcceptTerms={setAcceptTerms}
          locked={locked}
          saving={saving}
          onApprove={async () => {
            setSaving(true);
            setMessage(null);
            try {
              await approve({ token, acceptTerms: true });
              setMessage("Quote approved. Thank you.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Could not submit approval.");
            } finally {
              setSaving(false);
            }
          }}
          note={note}
          setNote={setNote}
          onRequestChanges={async () => {
            setSaving(true);
            setMessage(null);
            try {
              await requestChanges({ token, note: note.trim() });
              setMessage("Change request submitted.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Could not submit change request.");
            } finally {
              setSaving(false);
            }
          }}
        />

        {message ? <p className="text-sm text-primary">{message}</p> : null}
      </div>
    </PublicSiteChrome>
  );
}
