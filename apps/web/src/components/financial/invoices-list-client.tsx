"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { AdminCascadeDeleteDialog } from "@/components/admin/admin-cascade-delete-dialog";
import { InvoicePdfDownloadButton } from "@/components/financial/invoice-pdf-download-button";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/format";

type StatusFilter = "all" | "draft" | "finalized" | "void";
type ApprovalFilter = "all" | "pending" | "approved" | "changes_requested";

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

export function InvoicesListClient() {
  const viewer = useSessionViewer();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [search, setSearch] = useState("");
  const rows = useQuery(
    api.invoices.listEnriched,
    statusFilter === "all" ? {} : { status: statusFilter },
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
      if (approvalFilter !== "all" && (invoice.clientApprovalStatus ?? "pending") !== approvalFilter) {
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
  }, [rows, search, approvalFilter]);

  if (rows === undefined) return <p className="p-2 text-muted-foreground">Loading…</p>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input
            className="w-56"
            placeholder="Invoice, client, series…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="finalized">Finalized</option>
            <option value="void">Void</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Approval</label>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={approvalFilter}
            onChange={(e) => setApprovalFilter(e.target.value as ApprovalFilter)}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="changes_requested">Changes requested</option>
          </select>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left">Invoice #</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Series / Event</th>
            <th className="p-2 text-left">Manager</th>
            <th className="p-2 text-left">Issue Date</th>
            <th className="p-2 text-left">Total</th>
            <th className="p-2 text-left">Net profit</th>
            <th className="p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((invoice) => (
            <tr key={invoice._id} className="border-b">
              <td className="p-2">{invoice.invoiceNumber}</td>
              <td className="p-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(invoice)}`}
                >
                  {displayStatus(invoice)}
                </span>
              </td>
              <td className="p-2 text-muted-foreground">
                {invoice.seriesTitle ? (
                  <span>{invoice.seriesTitle}</span>
                ) : invoice.linkedEventTitle ? (
                  <span>{invoice.linkedEventTitle}</span>
                ) : (
                  "—"
                )}
              </td>
              <td className="p-2">{invoice.managerName}</td>
              <td className="p-2">{invoice.issueDate}</td>
              <td className="p-2">{formatUsd(invoice.totalUsd)}</td>
              <td className="p-2">
                {invoice.netProfitUsd == null ? "—" : formatUsd(invoice.netProfitUsd)}
              </td>
              <td className="p-2">
                <div className="flex flex-wrap gap-2">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!filteredRows.length ? <p className="p-2 text-muted-foreground">No invoices match your filters.</p> : null}

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
