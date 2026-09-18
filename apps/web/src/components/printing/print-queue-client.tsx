"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createColumnHelper } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { PrinterIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { formatDateTime } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";

type PrinterRow = FunctionReturnType<typeof api.printAgent.listPrinters>[number];
type JobRow = FunctionReturnType<typeof api.printJobs.listRecent>[number];

/** The agent heartbeats each minute; two missed beats reads as offline. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const jobColumnHelper = createColumnHelper<DataTableFeatures, JobRow>();

const JOB_STATUS_LABELS: Record<JobRow["status"], string> = {
  pending: "Rendering",
  ready: "Ready",
  printing: "Printing",
  printed: "Printed",
  failed: "Failed",
};

function jobStatusBadgeClass(status: JobRow["status"]): string {
  switch (status) {
    case "printed":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "printing":
      return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "ready":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "failed":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    default:
      return "border-muted-foreground/30 text-muted-foreground";
  }
}

function StatusBadge({ status }: { status: JobRow["status"] }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${jobStatusBadgeClass(status)}`}
    >
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}

function PrinterCard({ printer, now }: { printer: PrinterRow; now: number }) {
  const online =
    printer.lastSeenAt !== undefined && now - printer.lastSeenAt < ONLINE_WINDOW_MS;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <PrinterIcon className="size-5 text-muted-foreground" />
          <div>
            <CardTitle>{printer.name}</CardTitle>
            <p className="text-xs text-muted-foreground">Queue: {printer.queueName}</p>
          </div>
        </div>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
            online
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {online ? "Online" : "Offline"}
        </span>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p className="text-muted-foreground">
          Last seen: {printer.lastSeenAt ? formatDateTime(printer.lastSeenAt) : "Never"}
        </p>
        {printer.lastSeenStatus ? (
          <p className="text-muted-foreground">Status: {printer.lastSeenStatus}</p>
        ) : null}
        {printer.lastError ? <p className="text-destructive">Error: {printer.lastError}</p> : null}
      </CardContent>
    </Card>
  );
}

export function PrintQueueClient() {
  const printers = useQuery(api.printAgent.listPrinters, {});
  const jobs = useQuery(api.printJobs.listRecent, { limit: 100 });
  const reprint = useMutation(api.printJobs.reprint);
  const { alert } = useAppDialog();
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleReprint(job: JobRow) {
    setReprintingId(job._id);
    try {
      const jobId = await reprint({ eventId: job.eventId });
      if (!jobId) {
        await alert("No enabled printer is configured yet, so the reprint wasn't queued.");
      }
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Could not queue a reprint."));
    } finally {
      setReprintingId(null);
    }
  }

  const columns = jobColumnHelper.columns([
    jobColumnHelper.accessor("eventTitle", {
      id: "event",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Event" />,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.eventTitle}</div>
          <div className="text-xs text-muted-foreground">{row.original.fileName}</div>
        </div>
      ),
    }),
    jobColumnHelper.accessor("status", {
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    }),
    jobColumnHelper.accessor("printerName", {
      id: "printer",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Printer" />,
    }),
    jobColumnHelper.accessor("attempts", {
      id: "attempts",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Attempts" />,
    }),
    jobColumnHelper.accessor("createdAt", {
      id: "queued",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Queued" />,
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    }),
    jobColumnHelper.accessor((row) => row.printedAt ?? 0, {
      id: "printed",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Printed" />,
      cell: ({ row }) =>
        row.original.printedAt ? formatDateTime(row.original.printedAt) : "—",
      sortFn: "basic",
    }),
    jobColumnHelper.accessor((row) => row.error ?? "", {
      id: "error",
      header: "Error",
      cell: ({ row }) =>
        row.original.error ? (
          <span className="text-xs text-destructive">{row.original.error}</span>
        ) : (
          "—"
        ),
      enableSorting: false,
    }),
    jobColumnHelper.display({
      id: "actions",
      enableHiding: false,
      enableSorting: false,
      header: "Actions",
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={reprintingId === row.original._id}
          onClick={() => void handleReprint(row.original)}
        >
          {reprintingId === row.original._id ? "Queuing…" : "Reprint"}
        </Button>
      ),
    }),
  ]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Printers</CardTitle>
        </CardHeader>
        <CardContent>
          {printers === undefined ? (
            <p className="text-sm text-muted-foreground">Loading printers…</p>
          ) : printers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No printer has checked in yet. Install the agent on the warehouse Pi and it will
              appear here on its first heartbeat.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {printers.map((printer) => (
                <PrinterCard key={printer._id} printer={printer} now={now} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent print jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={jobs ?? []}
            getRowId={(row) => row._id}
            initialSorting={[{ id: "queued", desc: true }]}
            emptyMessage={
              jobs === undefined ? "Loading jobs…" : "No briefs have been queued yet."
            }
            getRowProps={(row) => ({ "data-testid": `print-job-${row.original._id}` })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
