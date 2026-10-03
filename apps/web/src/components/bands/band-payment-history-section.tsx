"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { SignatureIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { bandPaymentStatusTone } from "@/lib/band-payment-status";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { downloadBytes } from "@/lib/download-bytes";
import { formatDate, formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";
import { BandPaymentSignSheet, type SignablePayment } from "@/components/bands/band-payment-sign-sheet";
import {
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { ListRow } from "@/components/list-row";
import { EmptyState, ListSummary, RowCell, RowList, RowMenu, RowText } from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type PaymentRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.bandPayments.listForActiveBand>>
>[number];

const PAGE_SIZE = 10;

/** "Needs my signature" is about the viewer, the rest are the payout's stage. */
const STATUS_FILTER: FilterDefinition = {
  id: "status",
  label: "Status",
  options: [
    { value: "action_needed", label: "Needs my signature" },
    { value: "awaiting_confirmation", label: "Awaiting signature" },
    { value: "confirmed", label: "Ready to pay" },
    { value: "paid", label: "Paid" },
  ],
};

function statusCandidates(payment: PaymentRow) {
  return payment.canSign ? [payment.status, "action_needed"] : [payment.status];
}

export function BandPaymentHistorySection() {
  const payments = useQuery(api.bandPayments.listForActiveBand, {});
  const downloadPdf = useAction(api.bandPaymentPdfDownload.downloadByPaymentId);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [page, setPage] = useState(0);
  const [signing, setSigning] = useState<SignablePayment | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (payments ?? []).filter((payment) => {
      if (!matchesFilter(filters.status, statusCandidates(payment))) return false;
      if (!needle) return true;
      return [
        payment.eventTitle,
        payment.venueName,
        payment.confirmationToken,
        payment.statusLabel,
        payment.designatedPayeeName,
        payment.servicePaymentNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [payments, search, filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const toSign = (payments ?? []).filter((payment) => payment.canSign).length;
  const paidTotal = filtered
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.totalUsd, 0);

  async function onDownload(payment: PaymentRow) {
    try {
      const result = await downloadPdf({ paymentId: payment._id });
      downloadBytes(result.bytes, result.fileName);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SignatureIcon className="size-4 text-muted-foreground" aria-hidden />
          Payment history
        </CardTitle>
        <CardDescription>
          Every payout for your performances. Only the designated payee can e-sign a pending amount.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilterBar
          search={search}
          onSearchChange={(next) => {
            setSearch(next);
            setPage(0);
          }}
          searchPlaceholder="Event, payment ID…"
          searchLabel="Search payments"
          filters={[STATUS_FILTER]}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(0);
          }}
        />
        {payments === undefined ? (
          <p className="text-sm text-muted-foreground">Loading payments…</p>
        ) : (
          <>
            <ListSummary testId="band-payments-summary" order="Newest show first.">
              {[
                `${filtered.length} payment${filtered.length === 1 ? "" : "s"}`,
                toSign > 0 ? `${toSign} need${toSign === 1 ? "s" : ""} your signature` : null,
                paidTotal > 0 ? `${formatUsd(paidTotal)} paid` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </ListSummary>
            {pageRows.length === 0 ? (
              <EmptyState>
                {payments.length === 0
                  ? "No payments yet. Arbor adds a payout once a booking is confirmed."
                  : "No payments match your filters."}
              </EmptyState>
            ) : (
              <RowList joined testId="band-payments-list">
                {pageRows.map((payment) => (
                  <ListRow
                    key={payment._id}
                    data-testid="band-payment-row"
                    href={`/dashboard?show=${payment.eventId}`}
                    actions={
                      <div className="flex w-28 shrink-0 items-center justify-end gap-1">
                        {payment.canSign ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              setSigning({
                                _id: payment._id,
                                eventTitle: payment.eventTitle,
                                totalUsd: payment.totalUsd,
                                confirmationToken: payment.confirmationToken,
                              })
                            }
                          >
                            E-sign
                          </Button>
                        ) : null}
                        <RowMenu label={`More for ${payment.eventTitle}`}>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard?show=${payment.eventId}`}>Open show</Link>
                          </DropdownMenuItem>
                          {payment.canDownloadAgreementPdf ? (
                            <DropdownMenuItem onSelect={() => void onDownload(payment)}>
                              Download agreement
                            </DropdownMenuItem>
                          ) : null}
                        </RowMenu>
                      </div>
                    }
                  >
                    <RowText
                      eyebrow={[formatDate(payment.eventStartAt), payment.venueName]
                        .filter(Boolean)
                        .join(" · ")}
                      title={payment.eventTitle}
                      detail={
                        <>
                          <span className="sm:hidden">
                            {formatUsd(payment.totalUsd)} · {payment.statusLabel} ·{" "}
                          </span>
                          <span className="font-mono">{payment.confirmationToken}</span>
                          {payment.status === "awaiting_confirmation" && !payment.canSign
                            ? ` · Waiting on ${payment.designatedPayeeName || "your designated payee"}`
                            : null}
                        </>
                      }
                    />
                    <RowCell className="w-24" hideBelow="sm">
                      {formatUsd(payment.totalUsd)}
                    </RowCell>
                    <span className="hidden w-36 shrink-0 justify-end sm:flex">
                      <StatusPill tone={bandPaymentStatusTone(payment.status)}>
                        {payment.statusLabel}
                      </StatusPill>
                    </span>
                  </ListRow>
                ))}
              </RowList>
            )}
            {pageCount > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <p className="text-muted-foreground">
                  Showing {safePage * PAGE_SIZE + 1}–
                  {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={safePage <= 0}
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-muted-foreground tabular-nums">
                    Page {safePage + 1} of {pageCount}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <BandPaymentSignSheet
        payment={signing}
        open={signing !== null}
        onOpenChange={(open) => {
          if (!open) setSigning(null);
        }}
      />
    </Card>
  );
}
