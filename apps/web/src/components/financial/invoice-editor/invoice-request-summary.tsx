"use client";

import Link from "next/link";
import { CaretDownIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type SourceRequest = NonNullable<FunctionReturnType<typeof api.eventRequests.getByLinkedInvoiceId>>;

function Row({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <dt className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="break-words whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

/** What the client asked for, folded away until needed while building the quote. */
export function InvoiceRequestSummary({ request }: { request: SourceRequest }) {
  const times =
    request.eventScheduleText || `${request.eventStartTimeText} – ${request.eventEndTimeText}`;
  return (
    <Collapsible className="border" data-testid="invoice-request-summary">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <CollapsibleTrigger asChild>
          <button type="button" className="group flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
            <EnvelopeSimpleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="font-medium">Booking request {request.requestNumber}</span>
            <span className="truncate text-muted-foreground">
              · {request.firstName} {request.lastName} · {request.eventDateText}
            </span>
            <CaretDownIcon
              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={`/dashboard/ops-center/requests/${request._id}`}>Open request</Link>
        </Button>
      </div>
      <CollapsibleContent>
        <dl className="grid gap-3 border-t px-3 py-3 text-sm md:grid-cols-2">
          <Row label="Contact">
            {request.firstName} {request.lastName} · {request.email} · {request.phone}
          </Row>
          <Row label="Sponsor">
            {request.sponsorType}
            {request.organization ? ` · ${request.organization}` : ""}
          </Row>
          <Row label="Event">
            {request.eventName ? `${request.eventName} · ${request.eventCategory}` : request.eventCategory} ·{" "}
            {request.eventDateText}
          </Row>
          <Row label="Times">{times}</Row>
          <Row label="Setup">
            {request.earliestSetupText}
            {request.flexibleSetupTime ? " (flexible)" : ""}
          </Row>
          <Row label="Venue">
            {request.venueName ?? "—"}
            {request.venueAddress ? ` · ${request.venueAddress}` : ""}
          </Row>
          <Row label="Services">
            {[request.crewOrRental, ...request.servicesNeeded].filter(Boolean).join(", ")}
          </Row>
          <Row label="Turnout">
            {request.expectedTurnout}
            {request.productionTier ? ` · ${request.productionTier}` : ""}
          </Row>
          {request.lightingPreference ? <Row label="Lighting">{request.lightingPreference}</Row> : null}
          {request.eventDescription ? (
            <Row label="Description" wide>
              {request.eventDescription}
            </Row>
          ) : null}
          {request.existingEquipment ? (
            <Row label="Existing equipment" wide>
              {request.existingEquipment}
            </Row>
          ) : null}
          {request.additionalNotes ? (
            <Row label="Client notes" wide>
              {request.additionalNotes}
            </Row>
          ) : null}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}
