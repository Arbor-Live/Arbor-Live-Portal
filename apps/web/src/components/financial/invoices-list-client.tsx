"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AdminCascadeDeleteDialog } from "@/components/admin/admin-cascade-delete-dialog";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { copyQuoteLink, InvoiceSheet, invoiceIdParam } from "@/components/financial/invoice-sheet";
import { usePaymentActions } from "@/components/financial/payment-actions";
import { EmptyState, ListSummary, RowCell, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { StatusPill } from "@/components/page-header";
import { useSessionViewer } from "@/components/session-shell-provider";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSheetParam } from "@/hooks/use-sheet-param";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  INVOICE_GROUPS,
  invoiceLifecycle,
  lifecycleLabel,
  lifecycleTone,
  LIFECYCLE_OPTIONS,
} from "@/lib/invoice-lifecycle";
import { notify } from "@/lib/notify";
import { academicPeriod } from "@/lib/academic-periods";
import { addDaysToDateKey, formatUsd } from "@/lib/format";
import { usePacificToday } from "@/hooks/use-pacific-today";

type InvoiceRow = FunctionReturnType<typeof api.invoices.listEnriched>[number];

const ISSUED_OPTIONS = [
  { value: "last_30", label: "In the last 30 days" },
  { value: "last_90", label: "In the last 90 days" },
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "this_academic_year", label: "This academic year" },
  { value: "last_academic_year", label: "Last academic year" },
  { value: "this_year", label: "This calendar year" },
  { value: "older", label: "Before this calendar year" },
];

/** The Stanford periods behind the "Issued" quarter and academic-year buckets. */
function issuedPeriods(todayKey: string) {
  return [
    { value: "this_quarter", period: academicPeriod("this-quarter", todayKey) },
    { value: "last_quarter", period: academicPeriod("last-quarter", todayKey) },
    { value: "this_academic_year", period: academicPeriod("this-year", todayKey) },
    { value: "last_academic_year", period: academicPeriod("last-year", todayKey) },
  ];
}

/** Every "Issued" bucket an issue date (YYYY-MM-DD, Pacific) falls in. */
function issuedBuckets(issueDate: string, todayKey: string, periods: ReturnType<typeof issuedPeriods>): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return [];
  // "Last 30 days" is 30 calendar days counting today.
  const within = (days: number) => issueDate >= addDaysToDateKey(todayKey, -(days - 1)) && issueDate <= todayKey;
  return [
    ...(within(30) ? ["last_30"] : []),
    ...(within(90) ? ["last_90"] : []),
    ...periods
      .filter(({ period }) => period && period.startDate <= issueDate && issueDate <= period.endDate)
      .map(({ value }) => value),
    // A future-dated invoice is neither this year nor "before this year".
    ...(issueDate.slice(0, 4) === todayKey.slice(0, 4) ? ["this_year"] : []),
    ...(issueDate.slice(0, 4) < todayKey.slice(0, 4) ? ["older"] : []),
  ];
}

function statusText(invoice: InvoiceRow) {
  const lifecycle = invoiceLifecycle(invoice);
  if (lifecycle === "overdue" && invoice.daysOverdue > 0) {
    return `Overdue · ${invoice.daysOverdue} day${invoice.daysOverdue === 1 ? "" : "s"}`;
  }
  return lifecycleLabel(lifecycle);
}

/**
 * Every invoice, grouped by what it needs: Arbor's turn first, then the
 * client's, then closed. Rows open a side panel; the full editor is one click
 * further ("Open invoice").
 */
export function InvoicesListClient() {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const viewer = useSessionViewer();
  const isAdmin = viewer?.isAdmin ?? false;
  const payments = usePaymentActions();
  const [selectedId, setSelectedId] = useSheetParam("invoice");

  // Starts on the active view, shown as a chip so paid and void are one click away.
  const [filters, setFilters] = useState<FilterState>({
    stage: { operator: "is_not", values: ["paid", "void"] },
  });
  const [search, setSearch] = useState("");
  const todayKey = usePacificToday();
  const periods = useMemo(() => issuedPeriods(todayKey), [todayKey]);
  const applied = activeFilters(filters);
  const stage = applied.stage;
  const listQueryArgs = useMemo(() => {
    // Narrow on the server where the stage allows it, so the recency cap
    // applies to the right rows.
    if (stage?.operator === "is" && stage.values.length === 1) {
      if (stage.values[0] === "draft") return { status: "draft" as const };
      if (stage.values[0] === "void") return { status: "void" as const };
    }
    const showsClosed = stage ? ["paid", "void"].some((value) => matchesFilter(stage, value)) : true;
    return showsClosed ? {} : { excludeClosed: true as const };
  }, [stage]);
  const rows = useQuery(api.invoices.listEnriched, listQueryArgs);

  const duplicateInvoice = useMutation(api.invoices.duplicate);
  const voidInvoice = useMutation(api.invoices.voidInvoice);
  const unvoidInvoice = useMutation(api.invoices.unvoidInvoice);
  const deleteInvoiceAdmin = useMutation(api.adminDeletes.deleteInvoiceAdmin);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<Id<"invoices"> | null>(null);
  const deletePreview = useQuery(
    api.adminDeletes.previewInvoiceDeletion,
    deleteInvoiceId ? { id: deleteInvoiceId } : "skip",
  );

  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const distinct = (values: (string | undefined)[]) =>
      [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value }));
    return [
      { id: "stage", label: "Stage", options: LIFECYCLE_OPTIONS },
      { id: "client", label: "Client", options: distinct((rows ?? []).map((row) => row.clientGroupName)) },
      { id: "manager", label: "Manager", options: distinct((rows ?? []).map((row) => row.managerName)) },
      { id: "issued", label: "Issued", options: ISSUED_OPTIONS, single: true },
    ];
  }, [rows]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows ?? []).filter((invoice) => {
      if (!matchesFilter(applied.stage, invoiceLifecycle(invoice))) return false;
      if (!matchesFilter(applied.client, invoice.clientGroupName ?? "")) return false;
      if (!matchesFilter(applied.manager, invoice.managerName)) return false;
      if (!matchesFilter(applied.issued, issuedBuckets(invoice.issueDate, todayKey, periods))) return false;
      if (!needle) return true;
      return [
        invoice.invoiceNumber,
        invoice.managerName,
        invoice.clientGroupName,
        invoice.clientContactName,
        invoice.seriesTitle,
        invoice.linkedEventTitle,
      ].some((field) => field?.toLowerCase().includes(needle));
    });
  }, [applied.client, applied.issued, applied.manager, applied.stage, periods, rows, search, todayKey]);

  // Newest first within each group.
  const groups = useMemo(
    () =>
      INVOICE_GROUPS.map((group) => ({
        ...group,
        rows: shown
          .filter((invoice) => group.stages.includes(invoiceLifecycle(invoice)))
          .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.createdAt - a.createdAt),
      })).filter((group) => group.rows.length > 0),
    [shown],
  );

  const outstanding = shown
    .filter((invoice) => !["paid", "void", "draft"].includes(invoiceLifecycle(invoice)))
    .reduce((sum, invoice) => sum + invoice.totalUsd, 0);
  const needsYou = groups.find((group) => group.id === "needs_you")?.rows.length ?? 0;
  const narrowed = Boolean(search.trim()) || Object.keys(applied).length > 0;

  async function duplicate(invoice: InvoiceRow) {
    try {
      const result = await duplicateInvoice({ id: invoice._id });
      router.push(`/dashboard/financial-hub/invoices/${result.id}`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not duplicate the invoice."));
    }
  }

  async function toggleVoid(invoice: InvoiceRow) {
    if (invoice.status === "void") {
      try {
        await unvoidInvoice({ id: invoice._id });
        notify.success(`Restored ${invoice.invoiceNumber}.`);
      } catch (error) {
        notify.error(getConvexErrorMessage(error, "Could not restore the invoice."));
      }
      return;
    }
    const ok = await confirm({
      title: `Void ${invoice.invoiceNumber}?`,
      description: "It leaves the active list and the client's link stops working. You can restore it later.",
      destructive: true,
      confirmLabel: "Void invoice",
    });
    if (!ok) return;
    try {
      await voidInvoice({ id: invoice._id });
      notify.success(`Voided ${invoice.invoiceNumber}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not void the invoice."));
    }
  }

  return (
    <div className="space-y-4" data-testid="invoices-list">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Invoice, client, series…"
        searchLabel="Search invoices"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />

      {rows === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <ListSummary
            testId="invoices-summary"
            order="Grouped by who acts next, newest first within each group."
          >
            {shown.length} invoice{shown.length === 1 ? "" : "s"} · {needsYou} need you · {formatUsd(outstanding)}{" "}
            outstanding
          </ListSummary>

          {groups.length === 0 ? (
            <EmptyState
              action={
                narrowed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilters({});
                    }}
                  >
                    Clear search and filters
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/financial-hub/invoices/new">Create an invoice</Link>
                  </Button>
                )
              }
            >
              {narrowed ? "No invoices match this search and these filters." : "No invoices yet."}
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <RowGroup
                  key={group.id}
                  testId={`invoice-group-${group.id}`}
                  className="border"
                  title={group.label}
                  count={group.rows.length}
                  tone={group.id === "needs_you" ? "amber" : "neutral"}
                  description={group.description}
                  aside={
                    <span className="text-sm font-medium tabular-nums">
                      {formatUsd(group.rows.reduce((sum, invoice) => sum + invoice.totalUsd, 0))}
                    </span>
                  }
                >
                  {group.rows.map((invoice) => {
                    const lifecycle = invoiceLifecycle(invoice);
                    const forWhat = invoice.seriesTitle ?? invoice.linkedEventTitle;
                    return (
                      <ListRow
                        key={invoice._id}
                        data-testid={`invoice-list-row-${invoice._id}`}
                        onOpen={() => setSelectedId(invoice._id)}
                        actions={
                          <RowMenu label={`More for ${invoice.invoiceNumber}`}>
                            <DropdownMenuItem onSelect={() => setSelectedId(invoice._id)}>Open details</DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/financial-hub/invoices/${invoice._id}`}>Open invoice</Link>
                            </DropdownMenuItem>
                            {invoice.publicApprovalToken ? (
                              <DropdownMenuItem onSelect={() => void copyQuoteLink(invoice.publicApprovalToken!)}>
                                Copy quote link
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onSelect={() => void duplicate(invoice)}>Duplicate</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant={invoice.status === "void" ? "default" : "destructive"}
                              onSelect={() => void toggleVoid(invoice)}
                            >
                              {invoice.status === "void" ? "Restore invoice" : "Void invoice"}
                            </DropdownMenuItem>
                            {isAdmin ? (
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteInvoiceId(invoice._id)}>
                                Delete invoice
                              </DropdownMenuItem>
                            ) : null}
                          </RowMenu>
                        }
                      >
                        <RowText
                          eyebrow={`${invoice.issueDate} · ${invoice.clientGroupName || invoice.clientContactName || "No client"}`}
                          title={forWhat ? `${invoice.invoiceNumber} · ${forWhat}` : invoice.invoiceNumber}
                          detail={`Managed by ${invoice.managerName}${invoice.clientContactName && invoice.clientGroupName ? ` · ${invoice.clientContactName}` : ""}`}
                        />
                        <RowCell hideBelow="md" muted>
                          {invoice.netProfitUsd == null ? "—" : `${formatUsd(invoice.netProfitUsd)} net`}
                        </RowCell>
                        <RowCell>{formatUsd(invoice.totalUsd)}</RowCell>
                        <StatusPill
                          tone={lifecycleTone(lifecycle)}
                          className="hidden h-6 w-44 shrink-0 justify-center sm:inline-flex"
                        >
                          {statusText(invoice)}
                        </StatusPill>
                      </ListRow>
                    );
                  })}
                </RowGroup>
              ))}
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
      <AdminCascadeDeleteDialog
        open={deleteInvoiceId !== null}
        onClose={() => setDeleteInvoiceId(null)}
        entityName="quote"
        preview={deletePreview ?? null}
        onConfirm={async (cascade) => {
          if (!deleteInvoiceId) return;
          await deleteInvoiceAdmin({ id: deleteInvoiceId, cascade });
          setDeleteInvoiceId(null);
        }}
      />
    </div>
  );
}
