"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowSquareOutIcon, CheckIcon } from "@phosphor-icons/react";
import { BandPaymentAgreementPdfButton } from "@/components/financial/band-payment-agreement-pdf-button";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatBandPayeePayoutMethod } from "@/lib/band-payout-copy";
import {
  PAYOUT_STAGE_WHO,
  payoutAgeLabel,
  payoutLineupHref,
  payoutPrimaryAction,
  payoutStageTone,
  payoutStatusLabel,
  type PayoutRow,
} from "@/lib/band-payout-stages";
import { formatDate, formatDateTime, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PayoutSheetHandlers = {
  /** Runs the row's primary action (a dialog may take over). */
  runPrimary: (row: PayoutRow) => Promise<unknown>;
  /** Resolves true once the payout is removed; false if cancelled or it failed. */
  remove: (row: PayoutRow) => Promise<boolean>;
};

/** Details for one payout: payee, amounts, activity, and links back to the Lineup. */
export function PayoutSheet({
  row,
  onOpenChange,
  handlers,
}: {
  row: PayoutRow | null;
  onOpenChange: (open: boolean) => void;
  handlers: PayoutSheetHandlers;
}) {
  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="payout-sheet">
        {row ? (
          // Keyed so local state resets when another payout opens.
          <PayoutSheetBody
            key={row._id}
            row={row}
            handlers={handlers}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t px-4 py-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function pricingSummary(row: PayoutRow) {
  if (row.pricingMode !== "per_member_hourly") return "Fixed total";
  const parts = [
    row.memberCount != null ? `${row.memberCount} member${row.memberCount === 1 ? "" : "s"}` : null,
    row.performanceHours != null ? `${row.performanceHours} hr` : null,
    row.ratePerMemberPerHourUsd != null ? `${formatUsd(row.ratePerMemberPerHourUsd)}/member/hr` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" × ") : "Per member, hourly";
}

type Step = { label: string; at?: number; detail?: string };

function activitySteps(row: PayoutRow): Step[] {
  const queued = row.status !== "draft" ? (row.promotedAt ?? Math.max(row.eventEndAt, row.createdAt)) : undefined;
  return [
    { label: "Created", at: row.createdAt },
    { label: "Joined the queue after the event", at: queued },
    {
      label: "Signature request sent",
      at: row.confirmationEmailSentAt,
      detail: row.confirmationSentByName,
    },
    {
      label: "Signed",
      at: row.confirmedAt,
      detail: row.signatureTypedName ?? row.confirmationReplyFrom,
    },
    {
      label: "Paid",
      at: row.paidAt,
      detail: [row.paidByName, row.servicePaymentNumber ? `#${row.servicePaymentNumber}` : null]
        .filter(Boolean)
        .join(" · "),
    },
  ];
}

function PayoutSheetBody({
  row,
  handlers,
  onClose,
}: {
  row: PayoutRow;
  handlers: PayoutSheetHandlers;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const primary = payoutPrimaryAction(row.status);
  const stage = row.stage ?? "upcoming";
  const steps = activitySteps(row);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {row.bandName}
          <StatusPill tone={payoutStageTone(stage)} className="h-6">
            {payoutStatusLabel(row.status)}
          </StatusPill>
        </SheetTitle>
        <SheetDescription>
          {formatDate(row.eventStartAt)} · {row.eventTitle}
          {row.venueName ? ` · ${row.venueName}` : ""}
        </SheetDescription>
        <p className="text-sm">
          {PAYOUT_STAGE_WHO[stage]}
          <span className="text-muted-foreground"> · {payoutAgeLabel(row, nowMs)}</span>
        </p>
      </SheetHeader>

      {row.status === "pending_onboarding" && row.onboardingIncompleteSteps.length > 0 ? (
        <Section title="Onboarding left">
          <ul className="space-y-1 text-sm">
            {row.onboardingIncompleteSteps.map((step) => (
              <li key={step.id}>{step.label}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Payout">
        <dl className="space-y-2">
          <Field label="Amount">
            <span className="font-medium tabular-nums">{formatUsd(row.totalUsd)}</span>
          </Field>
          <Field label="Pricing">{pricingSummary(row)}</Field>
          <Field label="Payment ID">
            <span className="tabular-nums">{row.confirmationToken}</span>
          </Field>
          {row.servicePaymentNumber ? (
            <Field label="Transfer #">
              <span className="tabular-nums">{row.servicePaymentNumber}</span>
            </Field>
          ) : null}
        </dl>
        {row.canDownloadAgreementPdf ? (
          <BandPaymentAgreementPdfButton paymentId={row._id} label="Agreement PDF" />
        ) : null}
      </Section>

      <Section title="Payee">
        {!row.payeeComplete ? (
          <p className="rounded-md bg-status-amber-500/15 px-2 py-1 text-xs text-status-amber-800 dark:text-status-amber-200">
            Payee info is incomplete, so the signature request can&apos;t go out yet.
          </p>
        ) : null}
        <dl className="space-y-2">
          <Field label="Name">{row.designatedPayeeName ?? "Not set"}</Field>
          <Field label="Email">{row.designatedPayeeEmail ?? "Not set"}</Field>
          <Field label="Mailing address">
            <span className="whitespace-pre-wrap">{row.designatedPayeeMailingAddress?.trim() || "Not set"}</span>
          </Field>
          <Field label="Method">{formatBandPayeePayoutMethod(row.designatedPayeePayoutMethod)}</Field>
        </dl>
      </Section>

      <Section title="Activity">
        <ol className="space-y-2" data-testid="payout-activity">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-2 text-sm">
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
                  step.at
                    ? "border-status-emerald-500/40 bg-status-emerald-500/15 text-status-emerald-700 dark:text-status-emerald-300"
                    : "border-border",
                )}
                aria-hidden
              >
                {step.at ? <CheckIcon className="size-3" weight="bold" /> : null}
              </span>
              <div className="min-w-0">
                <p className={step.at ? undefined : "text-muted-foreground"}>{step.label}</p>
                {step.at ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(step.at)}
                    {step.detail ? ` · ${step.detail}` : ""}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Links">
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={payoutLineupHref(row)}>
              Open in Lineup
              <ArrowSquareOutIcon className="size-3" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/events/${row.eventId}`}>Open event</Link>
          </Button>
          {row.status === "pending_onboarding" ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/users/organizations">Manage onboarding</Link>
            </Button>
          ) : null}
        </div>
      </Section>

      <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
        {row.status !== "paid" ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                // Cancelling the confirm (or a failed removal) keeps the panel open.
                if (await handlers.remove(row)) onClose();
              })
            }
          >
            Remove payout
          </Button>
        ) : null}
        {primary ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => handlers.runPrimary(row))}>
            {primary.label}
          </Button>
        ) : null}
      </SheetFooter>
    </>
  );
}
