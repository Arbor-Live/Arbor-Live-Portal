"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { InvoiceSheet, invoiceIdParam } from "@/components/financial/invoice-sheet";
import { usePaymentActions } from "@/components/financial/payment-actions";
import { EmptyState, ListSummary, RowCell, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSheetParam } from "@/hooks/use-sheet-param";
import { api } from "@/lib/convex-api";
import { formatDate, formatUsd } from "@/lib/format";

type BoardItem = FunctionReturnType<typeof api.paymentProof.listBoard>[number];
type BoardGroup = BoardItem["group"];

const GROUPS: { id: BoardGroup; label: string; description: string }[] = [
  {
    id: "proof",
    label: "Proof to verify",
    description: "The client says they paid. Check the reference, then mark it received or invalidate it.",
  },
  { id: "overdue", label: "Overdue", description: "Past due with no proof. Late fees are accruing." },
  { id: "pending", label: "Waiting on payment", description: "Approved and not due yet." },
  { id: "received", label: "Received", description: "Paid in the last 90 days." },
];

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

const FILTERS: FilterDefinition[] = [
  {
    id: "due",
    label: "Due",
    options: [
      { value: "overdue", label: "Overdue" },
      { value: "soon", label: "Within 2 weeks" },
      { value: "later", label: "Later" },
    ],
  },
  {
    id: "receipt",
    label: "Receipt",
    single: true,
    options: [
      { value: "attached", label: "Receipt attached" },
      { value: "none", label: "No receipt" },
    ],
  },
];

/**
 * The back half of the invoice lifecycle: approved invoices from proof to
 * received, Arbor's turn first. Each group has one primary action; the side
 * panel has the rest.
 */
export function PaymentsBoard() {
  const board = useQuery(api.paymentProof.listBoard, {});
  const payments = usePaymentActions();
  const [selectedId, setSelectedId] = useSheetParam("invoice");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [showReceived, setShowReceived] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (board ?? []).filter(({ row }) => {
      const due = row.isOverdue ? "overdue" : row.dueAt - nowMs <= TWO_WEEKS_MS ? "soon" : "later";
      return (
        (!needle ||
          [row.invoiceNumber, row.eventTitle, row.clientContactName, row.clientEmail, row.submission?.paymentReference].some(
            (field) => field?.toLowerCase().includes(needle),
          )) &&
        matchesFilter(filters.due, due) &&
        matchesFilter(filters.receipt, row.hasReceipt ? "attached" : "none")
      );
    });
  }, [board, filters, nowMs, search]);

  const grouped = GROUPS.map((group) => ({
    ...group,
    items: shown.filter((item) => item.group === group.id),
  }));
  const count = (id: BoardGroup) => grouped.find((group) => group.id === id)?.items.length ?? 0;
  const owed = shown
    .filter((item) => item.group !== "received")
    .reduce((sum, item) => sum + item.row.totalUsd + (item.row.isOverdue ? item.row.lateFeeUsd : 0), 0);
  const narrowed = Boolean(search.trim()) || Object.keys(activeFilters(filters)).length > 0;

  function primaryAction(item: BoardItem) {
    const { row } = item;
    const busy = payments.busyInvoiceId === row.invoiceId;
    if (item.group === "proof") {
      return (
        <Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(row.invoiceId)}>
          Verify proof
        </Button>
      );
    }
    if (item.group === "received") {
      return row.hasReceipt ? null : (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => payments.pickReceipt(row.invoiceId)}>
          Attach receipt
        </Button>
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void payments.markReceived(row.invoiceId, row.invoiceNumber)}
      >
        Mark received
      </Button>
    );
  }

  return (
    <div className="space-y-4" data-testid="payments-board">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Invoice, event, client, reference…"
        searchLabel="Search payments"
        filters={FILTERS}
        value={filters}
        onChange={setFilters}
      />

      {board === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <ListSummary testId="payments-summary" order="Groups in the order Arbor acts on them; soonest due first.">
            {count("proof")} to verify · {count("overdue")} overdue · {count("pending")} waiting · {formatUsd(owed)} still
            owed
          </ListSummary>
          {shown.length === 0 ? (
            <EmptyState>
              {narrowed
                ? "No payments match this search and these filters."
                : "No approved invoices yet. Payments show up here once a client approves a quote."}
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => {
                const collapsed = group.id === "received" && !showReceived;
                if (group.items.length === 0 && group.id !== "proof") return null;
                return (
                  <RowGroup
                    key={group.id}
                    testId={`payment-group-${group.id}`}
                    className="border"
                    title={group.label}
                    count={group.items.length}
                    tone={
                      group.id === "proof"
                        ? group.items.length
                          ? "amber"
                          : "emerald"
                        : group.id === "overdue"
                          ? "rose"
                          : "neutral"
                    }
                    description={group.description}
                    aside={
                      group.id === "received" && group.items.length ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowReceived((open) => !open)}>
                          {showReceived ? "Hide" : "Show"}
                        </Button>
                      ) : null
                    }
                  >
                    {group.items.length === 0 ? (
                      <li className="px-3 py-3 text-sm text-muted-foreground">Nothing to verify. You&apos;re caught up.</li>
                    ) : collapsed ? null : (
                      group.items.map((item) => {
                        const { row } = item;
                        return (
                          <ListRow
                            key={row.invoiceId}
                            data-testid={`payment-row-${row.invoiceId}`}
                            onOpen={() => setSelectedId(row.invoiceId)}
                            actions={
                              <>
                                <div className="hidden w-36 shrink-0 justify-end md:flex">{primaryAction(item)}</div>
                                <RowMenu label={`More for ${row.invoiceNumber}`}>
                                  <DropdownMenuItem onSelect={() => setSelectedId(row.invoiceId)}>Open details</DropdownMenuItem>
                                  {row.submission && !row.paymentReceivedAt ? (
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        payments.requestInvalidate({
                                          submissionId: row.submission!.id,
                                          invoiceNumber: row.invoiceNumber,
                                        })
                                      }
                                    >
                                      Invalidate proof
                                    </DropdownMenuItem>
                                  ) : null}
                                  {row.submission || row.paymentReceivedAt ? (
                                    <DropdownMenuItem onSelect={() => payments.pickReceipt(row.invoiceId)}>
                                      {row.hasReceipt ? "Replace receipt" : "Attach receipt"}
                                    </DropdownMenuItem>
                                  ) : null}
                                </RowMenu>
                              </>
                            }
                          >
                            <RowText
                              eyebrow={`Due ${formatDate(row.dueAt)} · ${row.clientContactName ?? row.clientEmail ?? "No contact"}`}
                              title={`${row.invoiceNumber} · ${row.eventTitle}`}
                              detail={
                                row.submission
                                  ? `${row.submission.paymentMethodLabel} · ${row.submission.paymentReference}`
                                  : row.paymentReceivedAt
                                    ? `Received ${formatDate(row.paymentReceivedAt)}${row.hasReceipt ? " · receipt attached" : ""}`
                                    : row.isOverdue
                                      ? "No proof yet"
                                      : row.weeksUntilLateFee > 0
                                        ? `Late fees begin in ${row.weeksUntilLateFee} week${row.weeksUntilLateFee === 1 ? "" : "s"}`
                                        : "No proof yet"
                              }
                            />
                            {row.isOverdue && row.lateFeeUsd > 0 ? (
                              <RowCell className="w-28" hideBelow="md">
                                <span className="text-destructive">+{formatUsd(row.lateFeeUsd)} late</span>
                              </RowCell>
                            ) : (
                              <RowCell className="w-28" hideBelow="md">
                                {""}
                              </RowCell>
                            )}
                            <RowCell>{formatUsd(row.totalUsd)}</RowCell>
                          </ListRow>
                        );
                      })
                    )}
                  </RowGroup>
                );
              })}
            </div>
          )}
        </>
      )}

      <InvoiceSheet
        invoiceId={invoiceIdParam(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        payments={payments}
      />
      {payments.elements}
    </div>
  );
}
