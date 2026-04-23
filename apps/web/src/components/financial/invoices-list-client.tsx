"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";

export function InvoicesListClient() {
  const rows = useQuery(api.invoices.list, {});
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
              <td className="p-2">{invoice.status}</td>
              <td className="p-2">{invoice.managerName}</td>
              <td className="p-2">{invoice.issueDate}</td>
              <td className="p-2">${invoice.totalUsd.toFixed(2)}</td>
              <td className="p-2">
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/financial-hub/invoices/${invoice._id}`}>Open</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/financial-hub/invoices/${invoice._id}/print`}>Print</Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <p className="p-2 text-muted-foreground">No invoices yet.</p> : null}
    </>
  );
}
