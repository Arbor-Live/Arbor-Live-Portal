"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicEventHeader } from "@/components/public/public-event-header";
import { PublicEventSchedule } from "@/components/public/public-event-schedule";
import { PublicEventCrew } from "@/components/public/public-event-crew";
import { PublicEventContacts } from "@/components/public/public-event-contacts";
import { PublicQuoteFinancials } from "@/components/public/public-quote-financials";
import { PublicPaymentProofSection } from "@/components/public/public-payment-proof-section";
import { PublicInvoicePdfDownload } from "@/components/public/public-invoice-pdf-download";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  publicQuoteApprovalSchema,
  publicQuoteChangeRequestSchema,
  type PublicQuoteApprovalFormValues,
  type PublicQuoteChangeRequestFormValues,
} from "@/lib/validations/crew-availability";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/markdown-content";

export function PublicEventLifecycleClient({ token }: { token: string }) {
  const data = useQuery(api.invoices.getPublicQuoteByToken, { token });
  const approve = useMutation(api.invoices.approveByToken);
  const requestChanges = useMutation(api.invoices.requestChangesByToken);
  const submitPaymentProof = useMutation(api.paymentProof.submitByQuoteToken);

  const approvalForm = useConvexForm<PublicQuoteApprovalFormValues>({
    schema: publicQuoteApprovalSchema,
    defaultValues: { termsAccepted: false, note: "" },
    mode: "onTouched",
  });

  const changeForm = useConvexForm<PublicQuoteChangeRequestFormValues>({
    schema: publicQuoteChangeRequestSchema,
    defaultValues: { note: "" },
    mode: "onTouched",
  });

  const onApprove = approvalForm.submitMutation(async () => {
    await approve({ token, acceptTerms: true });
    changeForm.reset({ note: "" });
  });

  const onRequestChanges = changeForm.submitMutation(async (values) => {
    await requestChanges({ token, note: values.note.trim() });
    changeForm.reset({ note: "" });
  });

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
  const acceptTerms = approvalForm.watch("termsAccepted") === true;
  const combinedStatus =
    approvalForm.saveStatus !== "idle" ? approvalForm.saveStatus : changeForm.saveStatus;
  const combinedError = approvalForm.saveError ?? changeForm.saveError;
  const isDirty = approvalForm.formState.isDirty || changeForm.formState.isDirty;

  return (
    <PublicSiteChrome>
      <div className="mx-auto max-w-5xl space-y-4 p-6 pb-24">
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

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Terms & Conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <MarkdownContent>{data.termsAndConditionsMarkdown || "_No terms configured._"}</MarkdownContent>
              <Form {...approvalForm}>
                <form onSubmit={approvalForm.handleSubmit(onApprove)} className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      id="accept-terms"
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) =>
                        approvalForm.setValue("termsAccepted", e.target.checked, {
                          shouldDirty: true,
                        })
                      }
                      disabled={locked}
                    />
                    <Label htmlFor="accept-terms">
                      I accept the terms and conditions (version {data.termsVersion}).
                    </Label>
                  </label>
                  <Button
                    type="submit"
                    disabled={locked || !acceptTerms || approvalForm.saveStatus === "saving"}
                  >
                    Approve Quote
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Request Changes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Form {...changeForm}>
                <form onSubmit={changeForm.handleSubmit(onRequestChanges)} className="space-y-3">
                  <TextareaFormField
                    name="note"
                    label=""
                    placeholder="Tell us what changes are needed"
                    disabled={locked}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={locked || changeForm.saveStatus === "saving"}
                  >
                    Request Changes
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {data.paymentProof ? (
          <PublicPaymentProofSection
            token={token}
            paymentProof={data.paymentProof}
            submitMutation={submitPaymentProof}
          />
        ) : null}

        <FormSaveBar
          tier="C"
          saveStatus={combinedStatus}
          saveError={combinedError}
          isDirty={isDirty}
          isSubmitting={approvalForm.saveStatus === "saving" || changeForm.saveStatus === "saving"}
          saveLabel="Submit"
          onDiscard={() => {
            approvalForm.reset({ termsAccepted: false, note: "" });
            changeForm.reset({ note: "" });
          }}
        />
      </div>
    </PublicSiteChrome>
  );
}
