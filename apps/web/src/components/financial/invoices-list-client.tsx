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

function lifecycleLabel(lifecycle: InvoiceLifecycle) {
  return LIFECYCLE_OPTIONS.find((option) => option.value === lifecycle)?.label ?? lifecycle;
}

function lifecycleBadgeClass(lifecycle: InvoiceLifecycle) {
  switch (lifecycle) {
    case "paid":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
    case "payment_pending":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700";
    case "proof_received":
      return "border-violet-500/30 bg-violet-500/10 text-violet-700";
    case "overdue":
      return "border-red-500/30 bg-red-500/10 text-red-700";
    case "changes_requested":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800";
    case "awaiting_approval":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700";
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
  const [lifecycleFilters, setLifecycleFilters] = useState<InvoiceLifecycle[]>([]);
  const [search, setSearch] = useState("");
  const listQueryArgs = useMemo(() => {
    if (lifecycleFilters.length === 1) {
      if (lifecycleFilters[0] === "draft") return { status: "draft" as const };
      if (lifecycleFilters[0] === "void") return { status: "void" as const };
    }
    // Void and paid are hidden unless explicitly selected in the Stage filter.
    const hideClosed =
      !lifecycleFilters.includes("void") && !lifecycleFilters.includes("paid");
    return hideClosed ? { excludeClosed: true as const } : {};
  }, [lifecycleFilters]);
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
      const lifecycle = invoiceLifecycle(invoice);
      if (lifecycleFilters.length > 0 && !lifecycleFilters.includes(lifecycle)) {
        return false;
      }
      // Void and paid are archived by default; selecting them in the Stage
      // filter opts back in.
      if (
        (lifecycle === "void" || lifecycle === "paid") &&
        !lifecycleFilters.includes(lifecycle)
      ) {
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
  }, [rows, search, lifecycleFilters]);

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
                              notify.error(
                                error instanceof Error ? error.message : "Could not void the invoice.",
                              );
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
              label="Stage"
              options={LIFECYCLE_OPTIONS}
              values={lifecycleFilters}
              onChange={(values) => setLifecycleFilters(values as InvoiceLifecycle[])}
              emptyLabel="All"
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
