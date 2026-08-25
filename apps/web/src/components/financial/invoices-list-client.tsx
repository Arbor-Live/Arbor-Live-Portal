"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { MultiSelectFilter } from "@/components/inventory/multi-select-filter";
import { useSessionViewer } from "@/components/session-shell-provider";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";

async function copyQuoteLink(token: string) {
  const url = `${window.location.origin}/event/${token}`;
  try {
    await navigator.clipboard.writeText(url);
    notify.success("Quote link copied to clipboard.");
  } catch {
    notify.error("Could not copy link.");
  }
}

const STATUS_FILTER_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "finalized", label: "Finalized" },
  { value: "void", label: "Void" },
] as const;

const APPROVAL_FILTER_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "changes_requested", label: "Changes requested" },
] as const;

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
  const router = useRouter();
  const { confirm } = useAppDialog();
  const viewer = useSessionViewer();
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [approvalFilters, setApprovalFilters] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const listQueryArgs = useMemo(() => {
    if (statusFilters.length === 1) {
      return { status: statusFilters[0] as "draft" | "finalized" | "void" };
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
      if (statusFilters.length === 0) {
        if (invoice.status === "void") return false;
      } else if (statusFilters.length > 1 && !statusFilters.includes(invoice.status)) {
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

  if (rows === undefined) return <p className="p-2 text-muted-foreground">Loading…</p>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input
            placeholder="Invoice, client, series…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <MultiSelectFilter
          className="min-w-40"
          label="Status"
          placeholder="Filter status…"
          values={statusFilters}
          onChange={setStatusFilters}
          options={[...STATUS_FILTER_OPTIONS]}
          emptyLabel="Active"
        />
        <MultiSelectFilter
          className="min-w-44"
          label="Approval"
          placeholder="Filter approval…"
          values={approvalFilters}
          onChange={setApprovalFilters}
          options={[...APPROVAL_FILTER_OPTIONS]}
          emptyLabel="All"
        />
      </div>

      <div className="overflow-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
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
              <tr
                key={invoice._id}
                className="cursor-pointer border-t align-top hover:bg-muted/40"
                onClick={() => router.push(`/dashboard/financial-hub/invoices/${invoice._id}`)}
              >
                <td className="p-2">
                  <div className="font-medium">{invoice.invoiceNumber}</div>
                </td>
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
                <td className="p-2 whitespace-nowrap">{invoice.issueDate}</td>
                <td className="p-2 whitespace-nowrap">{formatUsd(invoice.totalUsd)}</td>
                <td className="p-2 whitespace-nowrap">
                  {invoice.netProfitUsd == null ? "—" : formatUsd(invoice.netProfitUsd)}
                </td>
                <td className="p-2" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center gap-1">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
