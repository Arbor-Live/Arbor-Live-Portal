"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { AdminCascadeDeleteDialog } from "@/components/admin/admin-cascade-delete-dialog";
import { Button } from "@/components/ui/button";

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

export function InvoicesListClient() {
  const viewer = useQuery(api.users.getViewer, {});
  const rows = useQuery(api.invoices.list, {});
  const deleteInvoiceAdmin = useMutation(api.adminDeletes.deleteInvoiceAdmin);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<Id<"invoices"> | null>(null);
  const deletePreview = useQuery(
    api.adminDeletes.previewInvoiceDeletion,
    deleteInvoiceId ? { id: deleteInvoiceId } : "skip",
  );
  const isAdmin = viewer?.isAdmin ?? false;

  if (rows === undefined) return <p className="p-2 text-muted-foreground">Loading…</p>;

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left">Invoice #</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Manager</th>
            <th className="p-2 text-left">Issue Date</th>
            <th className="p-2 text-left">Total</th>
            <th className="p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((invoice) => (
            <tr key={invoice._id} className="border-b">
              <td className="p-2">{invoice.invoiceNumber}</td>
              <td className="p-2">{displayStatus(invoice)}</td>
              <td className="p-2">{invoice.managerName}</td>
              <td className="p-2">{invoice.issueDate}</td>
              <td className="p-2">${invoice.totalUsd.toFixed(2)}</td>
              <td className="p-2">
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/financial-hub/invoices/${invoice._id}`}>Open</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/financial-hub/invoices/${invoice._id}/print`}>Print</Link>
                  </Button>
                  {invoice.publicApprovalToken ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/public/quote/${invoice.publicApprovalToken}`} target="_blank" rel="noreferrer">
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
      {!rows.length ? <p className="p-2 text-muted-foreground">No invoices yet.</p> : null}

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
