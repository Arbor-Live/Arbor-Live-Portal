"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { bandPaymentStatusTone } from "@/lib/band-payment-status";
import { formatDate, formatTime, formatUsd } from "@/lib/format";
import type { SignablePayment } from "@/components/bands/band-payment-sign-sheet";
import { BandPaymentAgreementPdfButton } from "@/components/financial/band-payment-agreement-pdf-button";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const SHOW_ROLE_LABELS = {
  headliner: "Headliner",
  support: "Support",
  other: "On the bill",
} as const;

/** "9:00 PM – 10:00 PM", or the start alone when the end isn't set. */
export function formatTimeWindow(
  startAt: number | null,
  endAt: number | null,
  timezone: string | undefined,
) {
  if (startAt == null) return null;
  if (endAt == null) return formatTime(startAt, timezone);
  return `${formatTime(startAt, timezone)} – ${formatTime(endAt, timezone)}`;
}

/** The pill for a show: cancelled wins, otherwise the payout's state. */
export function ShowStatusPill({
  show,
}: {
  show: {
    cancelled: boolean;
    paymentChipLabel: string;
    payment: { status: Parameters<typeof bandPaymentStatusTone>[0] } | null;
  };
}) {
  if (show.cancelled) return <StatusPill tone="rose">Cancelled</StatusPill>;
  return (
    <StatusPill tone={bandPaymentStatusTone(show.payment?.status)}>
      {show.paymentChipLabel}
    </StatusPill>
  );
}

function ShowSheetBody({
  eventId,
  onSign,
}: {
  eventId: Id<"events">;
  onSign: (payment: SignablePayment) => void;
}) {
  const show = useQuery(api.eventBands.getShowForActiveBand, { eventId });

  if (show === undefined) {
    return (
      <>
        <DetailSheetHeader title="Loading show…" />
        <p className="px-4 text-sm text-muted-foreground">Loading show…</p>
      </>
    );
  }
  if (show === null) {
    return (
      <>
        <DetailSheetHeader title="Show not found" />
        <p className="px-4 text-sm text-muted-foreground">
          This show isn&apos;t on your calendar anymore. Ask Arbor Live if you think that&apos;s a
          mistake.
        </p>
      </>
    );
  }

  const tz = show.timezone;
  const setWindow = formatTimeWindow(show.setStartsAt, show.setEndsAt, tz);
  const soundcheckWindow = formatTimeWindow(show.soundcheckStartsAt, show.soundcheckEndsAt, tz);
  const payment = show.payment;

  return (
    <>
      <DetailSheetHeader
        title={show.title}
        pill={<ShowStatusPill show={show} />}
        description={`${formatDate(show.startAt, tz)} · ${SHOW_ROLE_LABELS[show.role]}`}
      />

      <SheetSection title="When & where">
        <SheetFields>
          <SheetField label="Date">{formatDate(show.startAt, tz)}</SheetField>
          <SheetField label="Event">{formatTimeWindow(show.startAt, show.endAt, tz)}</SheetField>
          <SheetField label="Venue">{show.venueName || "To be confirmed"}</SheetField>
          {show.venueAddress ? (
            <SheetField label="Address">
              <span className="block">{show.venueAddress}</span>
              {show.venueMapsUrl ? (
                <a
                  href={show.venueMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
                >
                  Open map
                  <ArrowSquareOutIcon className="size-3" aria-hidden />
                </a>
              ) : null}
            </SheetField>
          ) : null}
        </SheetFields>
      </SheetSection>

      <SheetSection title="Your times">
        {setWindow || soundcheckWindow ? (
          <SheetFields>
            <SheetField label="Soundcheck">
              <span className="tabular-nums">{soundcheckWindow ?? "Not scheduled"}</span>
            </SheetField>
            <SheetField label="Set">
              <span className="tabular-nums">{setWindow ?? "Not scheduled"}</span>
            </SheetField>
          </SheetFields>
        ) : (
          <p className="text-sm text-muted-foreground">
            Arbor hasn&apos;t set your soundcheck or set times yet. They&apos;ll show here once the
            run of show is built.
          </p>
        )}
      </SheetSection>

      <SheetSection title="Payout">
        {payment ? (
          <div className="space-y-3">
            <SheetFields>
              <SheetField label="Amount">
                <span className="font-medium tabular-nums">{formatUsd(payment.totalUsd)}</span>
              </SheetField>
              <SheetField label="Status">{payment.statusLabel}</SheetField>
              {payment.designatedPayeeName ? (
                <SheetField label="Paid to">{payment.designatedPayeeName}</SheetField>
              ) : null}
              <SheetField label="Payment ID">
                <span className="font-mono text-xs">{payment.confirmationToken}</span>
              </SheetField>
            </SheetFields>
            {payment.status === "awaiting_confirmation" && !payment.canSign ? (
              <p className="text-sm text-muted-foreground">
                Waiting on {payment.designatedPayeeName || "your designated payee"} to sign.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {payment.canSign ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    onSign({
                      _id: payment._id,
                      eventTitle: show.title,
                      totalUsd: payment.totalUsd,
                      confirmationToken: payment.confirmationToken,
                    })
                  }
                >
                  E-sign payout
                </Button>
              ) : null}
              {payment.needsPayeeSetup ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/artists/payments#payee">Set up payee</Link>
                </Button>
              ) : null}
              {payment.canDownloadAgreementPdf ? (
                <BandPaymentAgreementPdfButton paymentId={payment._id} label="Download agreement" />
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No payout yet. Arbor adds it once your booking is confirmed, and you&apos;ll sign it
            here.
          </p>
        )}
      </SheetSection>

      <SheetSection title="Contact on the day">
        {show.contact ? (
          <SheetFields>
            <SheetField label={show.contact.roleLabel}>{show.contact.name || "Arbor Live"}</SheetField>
            {show.contact.email ? (
              <SheetField label="Email">
                <a href={`mailto:${show.contact.email}`} className="underline-offset-4 hover:underline">
                  {show.contact.email}
                </a>
              </SheetField>
            ) : null}
            {show.contact.phone ? (
              <SheetField label="Phone">
                <a href={`tel:${show.contact.phone}`} className="tabular-nums underline-offset-4 hover:underline">
                  {show.contact.phone}
                </a>
              </SheetField>
            ) : null}
          </SheetFields>
        ) : (
          <p className="text-sm text-muted-foreground">
            Arbor hasn&apos;t assigned a day-of contact yet.
          </p>
        )}
      </SheetSection>
    </>
  );
}

/**
 * Everything an artist needs for one show: where, their own times, the
 * payout, and who to call. Other acts and the full run of show stay staff-only.
 */
export function BandShowSheet({
  eventId,
  onOpenChange,
  onSign,
}: {
  eventId: Id<"events"> | null;
  onOpenChange: (open: boolean) => void;
  onSign: (payment: SignablePayment) => void;
}) {
  return (
    <DetailSheet open={eventId !== null} onOpenChange={onOpenChange} testId="band-show-sheet">
      {eventId ? <ShowSheetBody key={eventId} eventId={eventId} onSign={onSign} /> : null}
      <DetailSheetFooter>
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DetailSheetFooter>
    </DetailSheet>
  );
}
