"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createColumnHelper } from "@tanstack/react-table";
import { api, type Id } from "@/lib/convex-api";
import { AdminCascadeDeleteDialog } from "@/components/admin/admin-cascade-delete-dialog";
import { InvoicePdfDownloadButton } from "@/components/financial/invoice-pdf-download-button";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { type DataTableFeatures } from "@/components/ui/data-table-features";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { formatUsd } from "@/lib/format";

type InvoiceStatus = "draft" | "finalized" | "void";
type ApprovalStatus = "pending" | "approved" | "changes_requested";

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "finalized", label: "Finalized" },
  { value: "void", label: "Void" },
];

const APPROVAL_OPTIONS: { value: ApprovalStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "changes_requested", label: "Changes requested" },
];

type InvoiceRow = FunctionReturnType<typeof api.invoices.listEnriched>[number];

function displayStatus(invoice: {
  status: "draft" | "finalized" | "void";
  clientApprovalStatus?: "pending" | "approved" | "changes_requested";
}) {
  if (invoice.status === "finalized") return "Finalized";
  if (invoice.status === "void") return "Void";
  if (invoice.clientApprovalStatus === "changes_requested") return "Changes Requested";
  if (invoice.clientApprovalStatus === "approved") return "Approved";
  return "Draft";
}

function statusBadgeClass(invoice: {
  status: "draft" | "finalized" | "void";
  clientApprovalStatus?: "pending" | "approved" | "changes_requested";
}) {
  if (invoice.status === "void") return "bg-muted text-muted-foreground";
  if (invoice.clientApprovalStatus === "approved") return "bg-emerald-100 text-emerald-800";
  if (invoice.clientApprovalStatus === "changes_requested") return "bg-amber-100 text-amber-900";
  if (invoice.status === "finalized") return "bg-blue-100 text-blue-900";
  return "bg-slate-100 text-slate-800";
}

const columnHelper = createColumnHelper<DataTableFeatures, InvoiceRow>();

export function InvoicesListClient() {
  const viewer = useSessionViewer();
  const [statusFilters, setStatusFilters] = useState<InvoiceStatus[]>([]);
  const [approvalFilters, setApprovalFilters] = useState<ApprovalStatus[]>([]);
  const [search, setSearch] = useState("");
  const rows = useQuery(
    api.invoices.listEnriched,
    statusFilters.length === 1 ? { status: statusFilters[0] } : {},
  );
  const deleteInvoiceAdmin = useMutation(api.adminDeletes.deleteInvoiceAdmin);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<Id<"invoices"> | null>(null);
  const deletePreview = useQuery(
    api.adminDeletes.previewInvoiceDeletion,
    deleteInvoiceId ? { id: deleteInvoiceId } : "skip",
  );
  const isAdmin = viewer?.isAdmin ?? false;

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows ?? []).filter((invoice) => {
      if (statusFilters.length > 1 && !statusFilters.includes(invoice.status)) {
        return false;
      }
      const approval = invoice.clientApprovalStatus ?? "pending";
      if (approvalFilters.length > 0 && !approvalFilters.includes(approval)) {
        return false;
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
  }, [rows, search, statusFilters, approvalFilters]);

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
        columnHelper.accessor(
          (row) => row.seriesTitle ?? row.linkedEventTitle ?? "",
          {
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
          },
        ),
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
              <div className="flex min-w-[12rem] flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/financial-hub/invoices/${invoice._id}`}>Open</Link>
                </Button>
                <InvoicePdfDownloadButton
                  invoiceId={invoice._id}
                  invoiceNumber={invoice.invoiceNumber}
                  size="sm"
                  label="PDF"
                />
                {invoice.publicApprovalToken ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/event/${invoice.publicApprovalToken}`} target="_blank" rel="noreferrer">
                      Quote Link
                    </Link>
                  </Button>
                ) : null}
                {isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteInvoiceId(invoice._id)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            );
          },
        }),
      ]),
    [isAdmin],
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
