"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CurrencyDollarIcon, ImagesIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { BandPaymentAgreementPdfButton } from "@/components/financial/band-payment-agreement-pdf-button";
import { BandPaymentSignSheet } from "@/components/bands/band-payment-sign-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type ShowRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.eventBands.listShowsForActiveBand>>
>[number];

const ROLE_LABELS: Record<ShowRow["role"], string> = {
  headliner: "Headliner",
  support: "Support",
  other: "Other",
};

function chipClass(label: string) {
  switch (label) {
    case "Needs signature":
      return "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200";
    case "Paid":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "Confirmed":
      return "bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-200";
    case "Payment pending":
      return "bg-slate-100 text-slate-800 dark:bg-slate-500/15 dark:text-slate-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function ShowCard({
  show,
  onSign,
}: {
  show: ShowRow;
  onSign: (paymentId: Id<"eventBandPayments">) => void;
}) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{show.title}</p>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(show.startAt)}
            {show.venueName ? ` · ${show.venueName}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[show.role]}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
              chipClass(show.paymentChipLabel),
            )}
          >
            {show.paymentChipLabel}
          </span>
          {show.payment ? (
            <p className="text-sm font-medium">{formatUsd(show.payment.totalUsd)}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {show.payment?.canSign ? (
          <Button type="button" size="sm" onClick={() => onSign(show.payment!._id)}>
            E-sign payout
          </Button>
        ) : null}
        {show.payment?.needsPayeeSetup ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/bands-and-performers/payments#payee">Set up payee</Link>
          </Button>
        ) : null}
        {show.payment?.canDownloadAgreementPdf ? (
          <BandPaymentAgreementPdfButton paymentId={show.payment._id} label="PDF" size="sm" />
        ) : null}
      </div>
    </div>
  );
}

export function BandDashboard() {
  const shows = useQuery(api.eventBands.listShowsForActiveBand, {});
  const [signingId, setSigningId] = useState<Id<"eventBandPayments"> | null>(null);
  const [nowMs] = useState(() => Date.now());

  const { upcoming, recent } = useMemo(() => {
    const rows = shows ?? [];
    return {
      upcoming: rows.filter((row) => row.endAt >= nowMs),
      recent: rows
        .filter((row) => row.endAt < nowMs)
        .sort((a, b) => b.startAt - a.startAt)
        .slice(0, 8),
    };
  }, [shows, nowMs]);

  const signingShow = shows?.find((row) => row.payment?._id === signingId) ?? null;

  if (shows === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your shows</h1>
        <p className="text-sm text-muted-foreground">
          Upcoming bookings and payout status in one place.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/media" className="inline-flex items-center gap-1.5">
            <ImagesIcon className="size-4" />
            Media
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link
            href="/dashboard/bands-and-performers/payments"
            className="inline-flex items-center gap-1.5"
          >
            <CurrencyDollarIcon className="size-4" />
            Payments &amp; payee
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
          <CardDescription>Shows you&apos;re assigned to that haven&apos;t ended yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming shows yet.</p>
          ) : (
            upcoming.map((show) => (
              <ShowCard
                key={show.eventId}
                show={show}
                onSign={(paymentId) => setSigningId(paymentId)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent</CardTitle>
          <CardDescription>Past performances and payout follow-up.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent shows.</p>
          ) : (
            recent.map((show) => (
              <ShowCard
                key={show.eventId}
                show={show}
                onSign={(paymentId) => setSigningId(paymentId)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <BandPaymentSignSheet
        payment={
          signingShow?.payment
            ? {
                _id: signingShow.payment._id,
                eventTitle: signingShow.title,
                totalUsd: signingShow.payment.totalUsd,
              }
            : null
        }
        open={signingId !== null}
        onOpenChange={(open) => {
          if (!open) setSigningId(null);
        }}
      />
    </div>
  );
}
