"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createColumnHelper } from "@tanstack/react-table";
import {
  CopyIcon,
  DotsThreeIcon,
  LinkSimpleIcon,
  ProhibitIcon,
  ArrowCounterClockwiseIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { AdminCascadeDeleteDialog } from "@/components/admin/admin-cascade-delete-dialog";
import { InvoicePdfDownloadButton } from "@/components/financial/invoice-pdf-download-button";
import { useSessionViewer } from "@/components/session-shell-provider";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { type DataTableFeatures } from "@/components/ui/data-table-features";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";
import { getConvexErrorMessage } from "@/lib/convex-error";

type InvoiceRow = FunctionReturnType<typeof api.invoices.listEnriched>[number];

type InvoiceLifecycle =
  | "draft"
  | "awaiting_approval"
  | "changes_requested"
  | "payment_pending"
  | "proof_received"
  | "overdue"
  | "paid"
  | "void";

type InvoiceLifecycleInput = Pick<
  InvoiceRow,
  "status" | "clientApprovalStatus" | "paymentStatus"
>;

const LIFECYCLE_OPTIONS: { value: InvoiceLifecycle; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "payment_pending", label: "Payment pending" },
  { value: "proof_received", label: "Payment proof received" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

function invoiceLifecycle(invoice: InvoiceLifecycleInput): InvoiceLifecycle {
  if (invoice.status === "void") return "void";
  if (invoice.status === "draft") return "draft";
  if (invoice.paymentStatus) return invoice.paymentStatus;
  if (invoice.clientApprovalStatus === "changes_requested") return "changes_requested";
  return "awaiting_approval";
}

const ISSUED_OPTIONS = [
  { value: "last_30", label: "In the last 30 days" },
  { value: "last_90", label: "In the last 90 days" },
  { value: "this_year", label: "This year" },
  { value: "older", label: "Before this year" },
];

/** Every "Issued" bucket an issue date (YYYY-MM-DD) falls in. */
function issuedBuckets(issueDate: string, todayMs: number): string[] {
  const issuedMs = Date.parse(`${issueDate}T00:00:00`);
  if (Number.isNaN(issuedMs)) return [];
  const days = (todayMs - issuedMs) / 86_400_000;
  const thisYear = new Date(todayMs).getFullYear() === new Date(issuedMs).getFullYear();
  return [
    ...(days <= 30 ? ["last_30"] : []),
    ...(days <= 90 ? ["last_90"] : []),
    thisYear ? "this_year" : "older",
  ];
}

function lifecycleLabel(lifecycle: InvoiceLifecycle) {
  return LIFECYCLE_OPTIONS.find((option) => option.value === lifecycle)?.label ?? lifecycle;
}

function lifecycleBadgeClass(lifecycle: InvoiceLifecycle) {
  switch (lifecycle) {
    case "paid":
      return "border-status-emerald-500/30 bg-status-emerald-500/10 text-status-emerald-700";
    case "payment_pending":
      return "border-status-sky-500/30 bg-status-sky-500/10 text-status-sky-700";
    case "proof_received":
      return "border-status-violet-500/30 bg-status-violet-500/10 text-status-violet-700";
    case "overdue":
      return "border-status-red-500/30 bg-status-red-500/10 text-status-red-700";
    case "changes_requested":
      return "border-status-amber-500/30 bg-status-amber-500/10 text-status-amber-800";
    case "awaiting_approval":
      return "border-status-blue-500/30 bg-status-blue-500/10 text-status-blue-700";
    case "void":
    case "draft":
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

async function copyQuoteLink(token: string) {
  const url = `${window.location.origin}/event/${token}`;
  try {
    await navigator.clipboard.writeText(url);
    notify.success("Quote link copied to clipboard.");
  } catch {
    notify.error("Could not copy link.");
  }
}

const columnHelper = createColumnHelper<DataTableFeatures, InvoiceRow>();

export function InvoicesListClient() {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const viewer = useSessionViewer();
  // Starts on the active view, shown as a chip so paid and void are one click away.
  const [filters, setFilters] = useState<FilterState>({
    stage: { operator: "is_not", values: ["paid", "void"] },
  });
  const [search, setSearch] = useState("");
  const [todayMs] = useState(() => Date.now());
  const stage = activeFilters(filters).stage;
  const listQueryArgs = useMemo(() => {
    // Narrow on the server where the stage allows it, so the recency cap
    // applies to the right rows.
    if (stage?.operator === "is" && stage.values.length === 1) {
      if (stage.values[0] === "draft") return { status: "draft" as const };
      if (stage.values[0] === "void") return { status: "void" as const };
    }
    const showsClosed = stage
      ? LIFECYCLE_OPTIONS.some(
          (option) => (option.value === "paid" || option.value === "void") && matchesFilter(stage, option.value),
        )
      : true;
    return showsClosed ? {} : { excludeClosed: true as const };
  }, [stage]);
  const rows = useQuery(api.invoices.listEnriched, listQueryArgs);
  const deleteInvoiceAdmin = useMutation(api.adminDeletes.deleteInvoiceAdmin);
  const voidInvoice = useMutation(api.invoices.voidInvoice);
  const unvoidInvoice = useMutation(api.invoices.unvoidInvoice);
  const duplicateInvoice = useMutation(api.invoices.duplicate);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<Id<"invoices"> | null>(null);
  const deletePreview = useQuery(
    api.adminDeletes.previewInvoiceDeletion,
    deleteInvoiceId ? { id: deleteInvoiceId } : "skip",
  );
  const isAdmin = viewer?.isAdmin ?? false;

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

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const applied = activeFilters(filters);
    return (rows ?? []).filter((invoice) => {
      if (!matchesFilter(applied.stage, invoiceLifecycle(invoice))) return false;
      if (!matchesFilter(applied.client, invoice.clientGroupName ?? "")) return false;
      if (!matchesFilter(applied.manager, invoice.managerName)) return false;
      if (!matchesFilter(applied.issued, issuedBuckets(invoice.issueDate, todayMs))) return false;
      if (!needle) return true;
      const haystack = [
        invoice.invoiceNumber,
        invoice.managerName,
        invoice.clientGroupName,
        invoice.clientContactName,
        invoice.seriesTitle,
        invoice.linkedEventTitle,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [filters, rows, search, todayMs]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("invoiceNumber", {
          id: "invoice",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice #" />,
          cell: ({ row }) => <div className="font-medium">{row.original.invoiceNumber}</div>,
        }),
        columnHelper.accessor((row) => lifecycleLabel(invoiceLifecycle(row)), {
          id: "status",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
          cell: ({ row }) => {
            const lifecycle = invoiceLifecycle(row.original);
            const label =
              lifecycle === "overdue" && row.original.daysOverdue > 0
                ? `Overdue · ${row.original.daysOverdue} day${
                    row.original.daysOverdue === 1 ? "" : "s"
                  }`
                : lifecycleLabel(lifecycle);
            return (
              <span
                className={`inline-flex max-w-full items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${lifecycleBadgeClass(lifecycle)}`}
              >
                {label}
              </span>
            );
          },
        }),
        columnHelper.accessor((row) => row.seriesTitle ?? row.linkedEventTitle ?? "", {
          id: "series",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Series / Event" />,
          cell: ({ row }) => (
            <span className="text-muted-foreground">
              {row.original.seriesTitle
                ? row.original.seriesTitle
                : row.original.linkedEventTitle
                  ? row.original.linkedEventTitle
                  : "—"}
            </span>
          ),
        }),
        columnHelper.accessor("managerName", {
          id: "manager",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Manager" />,
        }),
        columnHelper.accessor("issueDate", {
          id: "issueDate",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Issue Date" />,
          cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span>,
        }),
        columnHelper.accessor("totalUsd", {
          id: "total",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
          cell: ({ getValue }) => (
            <span className="whitespace-nowrap">{formatUsd(getValue())}</span>
          ),
          sortFn: "basic",
        }),
        columnHelper.accessor((row) => row.netProfitUsd ?? Number.NEGATIVE_INFINITY, {
          id: "netProfit",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Net profit" />,
          cell: ({ row }) => (
            <span className="whitespace-nowrap">
              {row.original.netProfitUsd == null ? "—" : formatUsd(row.original.netProfitUsd)}
            </span>
          ),
          sortFn: "basic",
        }),
        columnHelper.display({
          id: "actions",
          enableHiding: false,
          enableSorting: false,
          header: "Actions",
          cell: ({ row }) => {
            const invoice = row.original;
            return (
              <div
                className="flex items-center gap-1"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <InvoicePdfDownloadButton
                  invoiceId={invoice._id}
                  invoiceNumber={invoice.invoiceNumber}
                  size="icon-sm"
                  iconOnly
                  label="PDF"
                />
                {invoice.publicApprovalToken ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    title="Copy quote link"
                    aria-label="Copy quote link"
                    onClick={() => {
                      void copyQuoteLink(invoice.publicApprovalToken!);
                    }}
                  >
                    <LinkSimpleIcon className="size-3.5" />
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="icon-sm" variant="outline" aria-label="More actions">
                      <DotsThreeIcon className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onSelect={() => {
                        void (async () => {
                          try {
                            const result = await duplicateInvoice({ id: invoice._id });
                            router.push(`/dashboard/financial-hub/invoices/${result.id}`);
                          } catch (error) {
                            notify.error(getConvexErrorMessage(error, "Could not duplicate the invoice."));
                          }
                        })();
                      }}
                    >
                      <CopyIcon className="size-4" />
                      Duplicate
                    </DropdownMenuItem>
                    {invoice.status === "void" ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          void (async () => {
                            try {
                              await unvoidInvoice({ id: invoice._id });
                              notify.success("Invoice restored.");
                            } catch (error) {
                              notify.error(getConvexErrorMessage(error, "Could not unvoid the invoice."));
                            }
                          })();
                        }}
                      >
                        <ArrowCounterClockwiseIcon className="size-4" />
                        Unvoid
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => {
                          void (async () => {
                            const confirmed = await confirm({
                              title: `Void ${invoice.invoiceNumber}?`,
                              description:
                                "It will hide from the active list. You can unvoid it later.",
                              confirmLabel: "Void",
                              destructive: true,
                            });
                            if (!confirmed) return;
                            try {
                              await voidInvoice({ id: invoice._id });
                              notify.success("Invoice voided.");
                            } catch (error) {
                              notify.error(getConvexErrorMessage(error, "Could not void the invoice."));
                            }
                          })();
                        }}
                      >
                        <ProhibitIcon className="size-4" />
                        Void
                      </DropdownMenuItem>
                    )}
                    {isAdmin ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleteInvoiceId(invoice._id)}
                        >
                          <TrashIcon className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          },
        }),
      ]),
    [confirm, duplicateInvoice, isAdmin, router, unvoidInvoice, voidInvoice],
  );

  if (rows === undefined) return <p className="p-2 text-muted-foreground">Loading…</p>;

  return (
    <>
      <DataTable
        columns={columns}
        data={filteredRows}
        getRowId={(row) => row._id}
        enableColumnVisibility
        emptyMessage="No invoices match your filters."
        // eslint-disable-next-line shadcn/require-static-classes -- DataTable rows take a className callback; both the value and the forwarded className are the table api.
        getRowClassName={() => "cursor-pointer"}
        getRowProps={(row) => ({
          onClick: () => router.push(`/dashboard/financial-hub/invoices/${row.original._id}`),
        })}
        toolbar={
          <div className="min-w-0 flex-1">
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Invoice, client, series…"
              searchLabel="Search invoices"
              filters={filterDefinitions}
              value={filters}
              onChange={setFilters}
            />
          </div>
        }
      />

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
    </>
  );
}
