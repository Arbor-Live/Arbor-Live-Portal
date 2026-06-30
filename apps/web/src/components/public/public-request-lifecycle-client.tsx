"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicEventHeader } from "@/components/public/public-event-header";
import { PublicEventSchedule } from "@/components/public/public-event-schedule";
import { PublicEventCrew } from "@/components/public/public-event-crew";
import { PublicEventContacts } from "@/components/public/public-event-contacts";
import { PublicQuoteFinancials } from "@/components/public/public-quote-financials";
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
    readyForClientReview: boolean;
    clientApprovalStatus: "pending" | "approved" | "changes_requested";
  };
}): LifecycleStep[] {
  if (request.status === "declined") {
    return [{ key: "declined", label: "Request declined", complete: true, active: true }];
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

export function PublicRequestLifecycleClient({ token }: { token: string }) {
  const request = useQuery(api.eventRequests.getPublicRequestByToken, { token });
  const quoteData = useQuery(api.eventRequests.getPublicRequestQuoteByToken, { token });
  const approve = useMutation(api.eventRequests.approveQuoteByRequestToken);
  const requestChanges = useMutation(api.eventRequests.requestQuoteChangesByRequestToken);

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

  if (request === undefined) {
    return <p className="text-sm text-muted-foreground">Loading your request...</p>;
  }
  if (!request) {
    return <p className="text-sm text-muted-foreground">This request link is invalid or expired.</p>;
  }

  const lifecycleSteps = buildLifecycleSteps(request);
  const isDeclined = request.status === "declined";
  const quoteLocked = quoteData ? quoteData.invoice.clientApprovalStatus !== "pending" : false;
  const linkedEvent = quoteData?.event ?? null;
  const acceptTerms = approvalForm.watch("termsAccepted") === true;
  const combinedStatus =
    approvalForm.saveStatus !== "idle" ? approvalForm.saveStatus : changeForm.saveStatus;
  const combinedError = approvalForm.saveError ?? changeForm.saveError;
  const isDirty = approvalForm.formState.isDirty || changeForm.formState.isDirty;

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>Request {request.requestNumber}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Status:{" "}
            <span className="font-medium">{STATUS_LABELS[request.status] ?? request.status}</span>
          </p>
          <p className="text-muted-foreground">
            Submitted {new Date(request.submittedAt).toLocaleString()}
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
              {request.quote.readyForClientReview
                ? request.quote.clientApprovalStatus === "approved"
                  ? " · Approved"
                  : request.quote.clientApprovalStatus === "changes_requested"
                    ? " · Changes requested"
                    : " · Ready for your review"
                : " · Being prepared"}
            </p>
          ) : null}
          {request.expectedTurnout >= 200 ? (
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
              This request was declined. Contact arborlive@stanford.edu if you have questions.
            </p>
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

      {quoteData ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Quote {quoteData.invoice.invoiceNumber}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Issued: {quoteData.invoice.issueDate}</p>
              {quoteData.invoice.clientGroupName ? <p>Group: {quoteData.invoice.clientGroupName}</p> : null}
              {quoteData.invoice.clientContactName ? <p>Contact: {quoteData.invoice.clientContactName}</p> : null}
              <p className="text-base font-semibold">Total: ${quoteData.invoice.totalUsd.toFixed(2)}</p>
              <p className="text-muted-foreground">Status: {quoteData.invoice.clientApprovalStatus}</p>
              {quoteData.invoice.clientApprovalNote ? (
                <p>Change request note: {quoteData.invoice.clientApprovalNote}</p>
              ) : null}
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

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Terms & Conditions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <MarkdownContent>
                  {quoteData.termsAndConditionsMarkdown || "_No terms configured._"}
                </MarkdownContent>
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
                        disabled={quoteLocked}
                      />
                      <Label htmlFor="accept-terms">
                        I accept the terms and conditions (version {quoteData.termsVersion}).
                      </Label>
                    </label>
                    <Button
                      type="submit"
                      disabled={quoteLocked || !acceptTerms || approvalForm.saveStatus === "saving"}
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
                      disabled={quoteLocked}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={quoteLocked || changeForm.saveStatus === "saving"}
                    >
                      Request Changes
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>

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
        </>
      ) : request.quote && !request.quote.readyForClientReview ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Your quote is being prepared. You will see the full quote here when it is ready for review.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
