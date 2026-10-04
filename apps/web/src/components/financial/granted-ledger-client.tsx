"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { BankIcon, CalendarBlankIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/convex-api";
import {
  DetailSheet,
  DetailSheetHeader,
  EmptyState,
  ListSummary,
  RowCell,
  RowFlag,
  RowGroup,
  RowText,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader, StatusPill } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDateTime, formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";

type Entry = FunctionReturnType<typeof api.grantedLedger.listEntries>["page"][number];

const PAGE_SIZE = 100;

/** `2026-09-21` → "Sep 21, 2026" (a calendar day, so no timezone shift). */
function formatDay(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function signedAmount(entry: Entry) {
  return entry.depositUsd !== 0 ? `+${formatUsd(entry.depositUsd)}` : `−${formatUsd(entry.withdrawalUsd)}`;
}

type PayoutMatch = Entry["payouts"][number];

function rowSNumber(entry: Entry) {
  return entry.grantedNumbers.find((number) => number.startsWith("S-"));
}

const normalizeNumber = (value: string) => value.toUpperCase().replace(/[\s-]/g, "");

/**
 * What a payout needs for a GrantED S-row: signed payouts get marked paid
 * with the row's number; paid ones recorded under another number get fixed.
 */
function payoutAction(payout: PayoutMatch, sNumber: string | undefined) {
  if (!sNumber) return null;
  if (payout.status === "confirmed") return "mark_paid" as const;
  if (
    payout.status === "paid" &&
    normalizeNumber(payout.servicePaymentNumber ?? "") !== normalizeNumber(sNumber)
  ) {
    return "change_number" as const;
  }
  return null;
}

function needsAttention(entry: Entry) {
  const sNumber = rowSNumber(entry);
  const fixable = (payout: PayoutMatch) => payoutAction(payout, sNumber) !== null;
  return (
    entry.invoices.some((invoice) => !invoice.paymentReceivedAt) ||
    entry.payouts.some(fixable) ||
    (entry.payouts.length === 0 && entry.suggestedPayouts.some(fixable)) ||
    entry.misnumberedPayouts.length > 0
  );
}

/** One line naming the portal records a row points at. */
function matchSummary(entry: Entry) {
  const parts = [
    ...entry.requests.map((request) => [request.requestNumber, request.eventName].filter(Boolean).join(" · ")),
    ...entry.invoices.map((invoice) => invoice.invoiceNumber),
    ...entry.payouts.map((payout) => `Payout to ${payout.payeeName ?? "artist"}`),
  ];
  return parts.join(" · ");
}

export function GrantedLedgerClient() {
  const accounts = useQuery(api.grantedLedger.listAccounts);
  const [pickedAccount, setPickedAccount] = useState<string | null>(null);
  const accountNumber = pickedAccount ?? accounts?.[0]?.accountNumber ?? null;
  const account = accounts?.find((a) => a.accountNumber === accountNumber);
  const { results, status, loadMore } = usePaginatedQuery(
    api.grantedLedger.listEntries,
    accountNumber ? { accountNumber } : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = results.find((entry) => entry._id === selectedId) ?? null;

  const pending = results.filter((entry) => entry.pending);
  const posted = results.filter((entry) => !entry.pending);
  const attention = results.filter(needsAttention).length;

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="GrantED ledger"
        description="Arbor's ASSU accounts, from the VSO Account Statement in GrantED. Rows that name a booking request, invoice or artist payout link to it."
        actions={<ImportStatementButton onImported={(first) => setPickedAccount((current) => current ?? first)} />}
        meta={
          account ? (
            <>
              <MetaItem icon={BankIcon}>
                {formatUsd(account.balanceUsd)} available
              </MetaItem>
              <MetaItem icon={CalendarBlankIcon}>
                Statement of {formatDay(account.statementDate)} · imported {formatDateTime(account.importedAt)}
              </MetaItem>
            </>
          ) : null
        }
      />

      {accounts === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : accounts.length === 0 ? (
        <EmptyState>
          No statements imported yet. In GrantED, open Reports → VSO Account Statement Report, pick an account
          and date range, choose Excel, and import the downloaded file here.
        </EmptyState>
      ) : (
        <>
          {accounts.length > 1 ? (
            <ToggleGroup
              type="single"
              variant="outline"
              value={accountNumber ?? ""}
              onValueChange={(value) => {
                if (!value) return;
                setPickedAccount(value);
                setSelectedId(null);
              }}
              aria-label="Account"
            >
              {accounts.map((a) => (
                <ToggleGroupItem key={a.accountNumber} value={a.accountNumber}>
                  {a.accountName} · {formatUsd(a.balanceUsd)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}

          <ListSummary
            testId="granted-ledger-summary"
            order="Newest first. Pending requests are already taken out of the balance but not yet posted."
          >
            {[
              `${posted.length} posted`,
              `${pending.length} pending`,
              attention > 0 ? `${attention} to update in the portal` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </ListSummary>

          {status === "LoadingFirstPage" ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="space-y-4">
              {pending.length > 0 ? (
                <LedgerGroup title="Pending" entries={pending} onOpen={setSelectedId} />
              ) : null}
              <LedgerGroup title="Posted" entries={posted} onOpen={setSelectedId} />
              {status === "CanLoadMore" ? (
                <Button type="button" variant="outline" size="sm" onClick={() => loadMore(PAGE_SIZE)}>
                  Load older rows
                </Button>
              ) : null}
            </div>
          )}
        </>
      )}

      <DetailSheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
        testId="granted-entry-sheet"
      >
        {selected ? <EntryDetails key={selected._id} entry={selected} /> : null}
      </DetailSheet>
    </div>
  );
}

function LedgerGroup({
  title,
  entries,
  onOpen,
}: {
  title: string;
  entries: Entry[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="border">
      <RowGroup title={title} count={entries.length}>
        {entries.length === 0 ? null : (
          entries.map((entry) => (
            <ListRow
              key={entry._id}
              onOpen={() => onOpen(entry._id)}
              leading={
                <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDay(entry.postedOn)}
                </span>
              }
            >
              <RowText
                eyebrow={[entry.source, entry.payee].filter(Boolean).join(" · ")}
                title={entry.description}
                detail={matchSummary(entry) || undefined}
              />
              {needsAttention(entry) ? <RowFlag>Update portal</RowFlag> : null}
              <RowCell className="w-28">{signedAmount(entry)}</RowCell>
              <RowCell className="w-28" hideBelow="md" muted>
                {formatUsd(entry.balanceUsd)}
              </RowCell>
            </ListRow>
          ))
        )}
      </RowGroup>
    </div>
  );
}

function EntryDetails({ entry }: { entry: Entry }) {
  const { confirm } = useAppDialog();
  const markPaymentReceived = useMutation(api.paymentProof.markPaymentReceived);
  const markPayoutPaid = useMutation(api.bandPayments.markPaid);
  const correctNumber = useMutation(api.bandPayments.correctServicePaymentNumber);
  const sNumber = rowSNumber(entry);

  async function attempt(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      notify.success(success);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  /** The fix a payout needs for this row, as a button, or nothing. */
  function payoutButton(payout: PayoutMatch) {
    const action = payoutAction(payout, sNumber);
    if (!action || !sNumber) return null;
    const name = payout.payeeName ?? "this payout";
    if (action === "mark_paid") {
      return (
        <Button
          type="button"
          size="sm"
          onClick={() =>
            void (async () => {
              const ok = await confirm({
                title: `Mark ${name} paid as ${sNumber}?`,
                description: "The artist gets the payment-completed email.",
                confirmLabel: "Mark paid",
              });
              if (!ok) return;
              await attempt(
                () => markPayoutPaid({ paymentId: payout._id, servicePaymentNumber: sNumber }),
                `Payout marked paid as ${sNumber}.`,
              );
            })()
          }
        >
          Mark paid as {sNumber}
        </Button>
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        onClick={() =>
          void (async () => {
            const ok = await confirm({
              title: `Change ${name}'s transfer number to ${sNumber}?`,
              description: `It's recorded as ${payout.servicePaymentNumber ?? "nothing"}. The payout stays paid and the artist isn't emailed.`,
              confirmLabel: "Change number",
            });
            if (!ok) return;
            await attempt(
              () => correctNumber({ paymentId: payout._id, servicePaymentNumber: sNumber }),
              `Transfer number changed to ${sNumber}.`,
            );
          })()
        }
      >
        Change to {sNumber}
      </Button>
    );
  }

  return (
    <>
      <DetailSheetHeader
        title={signedAmount(entry)}
        pill={<StatusPill tone={entry.pending ? "amber" : "emerald"}>{entry.pending ? "Pending" : "Posted"}</StatusPill>}
        description={entry.description}
      />
      <SheetSection title="GrantED">
        <SheetFields>
          <SheetField label="Date">{formatDay(entry.postedOn)}</SheetField>
          <SheetField label="Source">{entry.source}</SheetField>
          {entry.payee ? <SheetField label="Payee">{entry.payee}</SheetField> : null}
          {entry.grantedNumbers.length > 0 ? (
            <SheetField label="GrantED numbers">{entry.grantedNumbers.join(", ")}</SheetField>
          ) : null}
          {entry.legacyInvoiceNumbers.length > 0 ? (
            <SheetField label="Old invoice numbers">{entry.legacyInvoiceNumbers.join(", ")}</SheetField>
          ) : null}
          <SheetField label="Balance after">{formatUsd(entry.balanceUsd)}</SheetField>
        </SheetFields>
      </SheetSection>

      {entry.requests.length > 0 || entry.invoices.length > 0 ? (
        <SheetSection title="Booking">
          <ul className="space-y-3 text-sm">
            {entry.requests.map((request) => (
              <li key={request._id}>
                <Link className="font-medium underline-offset-4 hover:underline" href={`/dashboard/financial-hub/requests/${request._id}`}>
                  {request.requestNumber}
                </Link>
                {request.eventName ? <span className="text-muted-foreground"> · {request.eventName}</span> : null}
              </li>
            ))}
            {entry.invoices.map((invoice) => (
              <li key={invoice._id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link className="font-medium underline-offset-4 hover:underline" href={`/dashboard/financial-hub/invoices/${invoice._id}`}>
                    {invoice.invoiceNumber}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {invoice.clientGroupName ? `${invoice.clientGroupName} · ` : ""}
                    {formatUsd(invoice.totalUsd)}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {invoice.paymentReceivedAt
                      ? `Payment received ${formatDateTime(invoice.paymentReceivedAt)}`
                      : "Not marked as paid in the portal"}
                  </p>
                </div>
                {!invoice.paymentReceivedAt && entry.depositUsd > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      void attempt(
                        () => markPaymentReceived({ invoiceId: invoice._id }),
                        `${invoice.invoiceNumber} marked as paid.`,
                      )
                    }
                  >
                    Mark payment received
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </SheetSection>
      ) : null}

      {entry.payouts.length > 0 || entry.suggestedPayouts.length > 0 || entry.misnumberedPayouts.length > 0 ? (
        <SheetSection title="Artist payout">
          <ul className="space-y-3 text-sm">
            {entry.payouts.map((payout) => (
              <PayoutLine
                key={payout._id}
                payout={payout}
                note={payout.status === "paid" ? `Paid · #${payout.servicePaymentNumber ?? "no number"}` : "Not marked paid"}
                action={payoutButton(payout)}
              />
            ))}
            {entry.payouts.length === 0
              ? entry.suggestedPayouts.map((payout) => (
                  <PayoutLine
                    key={payout._id}
                    payout={payout}
                    note={`Same payee and amount as this row. ${
                      payout.status === "confirmed"
                        ? "Signed and waiting to be marked paid."
                        : "The artist hasn't signed in the portal yet, so it can't be marked paid."
                    }`}
                    action={payoutButton(payout)}
                  />
                ))
              : null}
            {entry.misnumberedPayouts.map((payout) => (
              <PayoutLine
                key={payout._id}
                payout={payout}
                warning
                note={`Same payee and amount, but recorded as ${
                  payout.servicePaymentNumber ? `#${payout.servicePaymentNumber}` : "no number"
                }.`}
                action={payoutButton(payout)}
              />
            ))}
          </ul>
        </SheetSection>
      ) : null}
    </>
  );
}

function ImportStatementButton({ onImported }: { onImported: (accountNumber: string) => void }) {
  const importStatement = useMutation(api.grantedLedger.importStatement);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(file: File) {
    setBusy(true);
    try {
      const result = await importStatement({ html: await file.text() });
      if (result.accounts[0]) onImported(result.accounts[0]);
      notify.success(
        [
          `${result.added} new ${result.added === 1 ? "row" : "rows"}`,
          result.alreadyImported > 0 ? `${result.alreadyImported} already imported` : null,
          `${result.pending} pending`,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.html,.htm,application/vnd.ms-excel,text/html"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
        }}
      />
      <Button type="button" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        <UploadSimpleIcon />
        {busy ? "Importing…" : "Import statement"}
      </Button>
    </>
  );
}

function PayoutLine({
  payout,
  note,
  warning,
  action,
}: {
  payout: PayoutMatch;
  note: string;
  warning?: boolean;
  action: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <Link
          className="font-medium underline-offset-4 hover:underline"
          href={`/dashboard/financial-hub/artist-payouts?payout=${payout._id}`}
        >
          {payout.payeeName ?? "Artist payout"}
        </Link>
        <span className="text-muted-foreground"> · {formatUsd(payout.totalUsd)}</span>
        <p
          className={
            warning ? "text-xs text-status-amber-800 dark:text-status-amber-200" : "text-xs text-muted-foreground"
          }
        >
          {note}
        </p>
      </div>
      {action}
    </li>
  );
}
