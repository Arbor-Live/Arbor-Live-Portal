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
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";

type InvoiceStatus = "draft" | "finalized" | "void";
type ApprovalStatus = "pending" | "approved" | "changes_requested";

type InvoiceRow = FunctionReturnType<typeof api.invoices.listEnriched>[number];

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "finalized", label: "Published" },
  { value: "void", label: "Void" },
];

const APPROVAL_OPTIONS: { value: ApprovalStatus; label: string }[] = [
  { value: "pending", label: "Waiting approval" },
  { value: "approved", label: "Approved" },
  { value: "changes_requested", label: "Changes requested" },
];

async function copyQuoteLink(token: string) {
  const url = `${window.location.origin}/event/${token}`;
  try {
    await navigator.clipboard.writeText(url);
    notify.success("Quote link copied to clipboard.");
  } catch {
    notify.error("Could not copy link.");
  }
}

/** Lifecycle label for the list — not the raw draft/finalized/void doc status. */
function displayStatus(invoice: {
  status: "draft" | "finalized" | "void";
  clientApprovalStatus?: "pending" | "approved" | "changes_requested";
  paymentReceivedAt?: number;
}) {
  if (invoice.status === "void") return "Void";
  if (invoice.status === "draft") return "Draft";
  if (invoice.paymentReceivedAt) return "Payment received";
  if (invoice.clientApprovalStatus === "approved") return "Payment pending";
  if (invoice.clientApprovalStatus === "changes_requested") return "Changes Requested";
  return "Waiting approval";
}

function statusBadgeClass(invoice: {
  status: "draft" | "finalized" | "void";
  clientApprovalStatus?: "pending" | "approved" | "changes_requested";
  paymentReceivedAt?: number;
}) {
  if (invoice.status === "void") return "bg-muted text-muted-foreground";
  if (invoice.status === "draft") return "bg-slate-100 text-slate-800";
  if (invoice.paymentReceivedAt) return "bg-emerald-100 text-emerald-800";
  if (invoice.clientApprovalStatus === "approved") return "bg-sky-100 text-sky-900";
  if (invoice.clientApprovalStatus === "changes_requested") return "bg-amber-100 text-amber-900";
  return "bg-blue-100 text-blue-900";
}

const columnHelper = createColumnHelper<DataTableFeatures, InvoiceRow>();

export function InvoicesListClient() {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const viewer = useSessionViewer();
  const [statusFilters, setStatusFilters] = useState<InvoiceStatus[]>([]);
  const [approvalFilters, setApprovalFilters] = useState<ApprovalStatus[]>([]);
  const [search, setSearch] = useState("");
  const listQueryArgs = useMemo(() => {
    if (statusFilters.length === 1) {
      return { status: statusFilters[0] };
    }
    return {};
  }, [statusFilters]);
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

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows ?? []).filter((invoice) => {
      if (statusFilters.length > 0 && !statusFilters.includes(invoice.status)) {
        return false;
      }
      if (approvalFilters.length > 0) {
        const approval = invoice.clientApprovalStatus ?? "pending";
        if (!approvalFilters.includes(approval)) return false;
      }
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
  }, [rows, search, approvalFilters, statusFilters]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("invoiceNumber", {
          id: "invoice",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice #" />,
          cell: ({ row }) => <div className="font-medium">{row.original.invoiceNumber}</div>,
        }),
        columnHelper.accessor((row) => displayStatus(row), {
          id: "status",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
          cell: ({ row }) => (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.original)}`}
            >
              {displayStatus(row.original)}
            </span>
          ),
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
                        void duplicateInvoice({ id: invoice._id }).then((result) => {
                          router.push(`/dashboard/financial-hub/invoices/${result.id}`);
                        });
                      }}
                    >
                      <CopyIcon className="size-4" />
                      Duplicate
                    </DropdownMenuItem>
                    {invoice.status === "void" ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          void unvoidInvoice({ id: invoice._id });
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
                            await voidInvoice({ id: invoice._id });
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
        getRowClassName={() => "cursor-pointer"}
        getRowProps={(row) => ({
          onClick: () => router.push(`/dashboard/financial-hub/invoices/${row.original._id}`),
        })}
        toolbar={
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Search</label>
              <Input
                placeholder="Invoice, client, series…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <MultiSelect
              label="Status"
              options={STATUS_OPTIONS}
              values={statusFilters}
              onChange={(values) => setStatusFilters(values as InvoiceStatus[])}
              emptyLabel="All"
            />
            <MultiSelect
              label="Approval"
              options={APPROVAL_OPTIONS}
              values={approvalFilters}
              onChange={(values) => setApprovalFilters(values as ApprovalStatus[])}
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
