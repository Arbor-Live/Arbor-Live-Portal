"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { PrinterIcon } from "@phosphor-icons/react";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { EmptyState, ListSummary, RowCell, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader, StatusPill, type Tone } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDateTime } from "@/lib/format";
import { notify } from "@/lib/notify";

type PrinterRow = FunctionReturnType<typeof api.printAgent.listPrinters>[number];
type JobRow = FunctionReturnType<typeof api.printJobs.listRecent>[number];

/** The agent heartbeats about every 10 min (jittered); allow a missed beat. */
const ONLINE_WINDOW_MS = 15 * 60 * 1000;

const JOB_STATUS_LABELS: Record<JobRow["status"], string> = {
  pending: "Rendering",
  ready: "Ready",
  printing: "Printing",
  printed: "Printed",
  failed: "Failed",
};

const JOB_STATUS_TONES: Record<JobRow["status"], Tone> = {
  pending: "neutral",
  ready: "blue",
  printing: "blue",
  printed: "emerald",
  failed: "rose",
};

const JOB_KIND_LABELS: Record<JobRow["kind"], string> = {
  brief: "Brief",
  event_file: "Event file",
  poster: "Poster",
};

const JOB_GROUPS: { id: string; label: string; description: string; statuses: JobRow["status"][] }[] = [
  {
    id: "failed",
    label: "Needs attention",
    description: "The printer gave up on these. Check the printer, then reprint.",
    statuses: ["failed"],
  },
  {
    id: "queued",
    label: "In the queue",
    description: "Rendering, waiting for the printer, or printing now.",
    statuses: ["pending", "ready", "printing"],
  },
  { id: "printed", label: "Printed", description: "Done. Reprint if a copy went missing.", statuses: ["printed"] },
];

function isOnline(printer: PrinterRow, now: number) {
  return printer.lastSeenAt !== undefined && now - printer.lastSeenAt < ONLINE_WINDOW_MS;
}

/**
 * The warehouse printers and the last 100 jobs sent to them: what failed
 * first, then what's still on its way, then what printed.
 */
export function PrintQueueClient() {
  const printers = useQuery(api.printAgent.listPrinters, {});
  const jobs = useQuery(api.printJobs.listRecent, { limit: 100 });
  const reprint = useMutation(api.printJobs.reprintJob);
  const { alert } = useAppDialog();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // The 100 most recent jobs are all on the page, so filters run here.
  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const distinct = (values: string[]) =>
      [...new Set(values)].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
    return [
      {
        id: "status",
        label: "Status",
        options: (Object.keys(JOB_STATUS_LABELS) as JobRow["status"][]).map((value) => ({
          value,
          label: JOB_STATUS_LABELS[value],
        })),
      },
      {
        id: "kind",
        label: "Kind",
        options: (Object.keys(JOB_KIND_LABELS) as JobRow["kind"][]).map((value) => ({
          value,
          label: JOB_KIND_LABELS[value],
        })),
      },
      { id: "printer", label: "Printer", options: distinct((jobs ?? []).map((job) => job.printerName)) },
      {
        id: "event",
        label: "Event",
        options: [...new Map((jobs ?? []).map((job) => [job.eventId as string, job.eventTitle])).entries()]
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    ];
  }, [jobs]);

  const shownJobs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (jobs ?? []).filter(
      (job) =>
        (!needle || [job.eventTitle, job.fileName].some((field) => field.toLowerCase().includes(needle))) &&
        matchesFilter(filters.status, job.status) &&
        matchesFilter(filters.kind, job.kind) &&
        matchesFilter(filters.printer, job.printerName) &&
        matchesFilter(filters.event, job.eventId),
    );
  }, [filters, jobs, search]);
  const narrowed = Boolean(search.trim()) || Object.keys(activeFilters(filters)).length > 0;
  const onlineCount = (printers ?? []).filter((printer) => isOnline(printer, now)).length;
  const count = (id: string) =>
    shownJobs.filter((job) => JOB_GROUPS.find((group) => group.id === id)!.statuses.includes(job.status)).length;

  async function handleReprint(job: JobRow) {
    setReprintingId(job._id);
    try {
      const jobId = await reprint({ jobId: job._id });
      if (!jobId) {
        await alert("No enabled printer is configured yet, so the reprint wasn't queued.");
      } else {
        notify.success(`Reprint of ${job.fileName} queued.`);
      }
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Could not queue a reprint."));
    } finally {
      setReprintingId(null);
    }
  }

  return (
    <div className="space-y-4 pb-24" data-testid="print-queue-page">
      <PageHeader
        title="Print queue"
        description="Briefs, event files and posters sent to the warehouse printers. The printer agent picks up ready jobs within a minute."
        meta={
          printers ? (
            <MetaItem icon={PrinterIcon}>
              {onlineCount} of {printers.length} printer{printers.length === 1 ? "" : "s"} online
            </MetaItem>
          ) : null
        }
      />

      {printers === undefined ? (
        <Skeleton className="h-20 w-full" />
      ) : printers.length === 0 ? (
        <EmptyState>
          No printer has checked in yet. Install the agent on the warehouse Pi and it will appear here.
        </EmptyState>
      ) : (
        <RowGroup title="Printers" count={printers.length} className="border" testId="printers">
          {printers.map((printer) => {
            const online = isOnline(printer, now);
            return (
              <ListRow key={printer._id} data-testid={`printer-row-${printer.queueName}`}>
                <RowText
                  eyebrow={`Queue ${printer.queueName}`}
                  title={printer.name}
                  detail={
                    printer.lastError
                      ? `Error: ${printer.lastError}`
                      : `Last seen ${printer.lastSeenAt ? formatDateTime(printer.lastSeenAt) : "never"}${printer.lastSeenStatus ? ` · ${printer.lastSeenStatus}` : ""}`
                  }
                />
                <StatusPill tone={online ? "emerald" : "rose"} className="h-6 w-24 shrink-0 justify-center">
                  {online ? "Online" : "Offline"}
                </StatusPill>
              </ListRow>
            );
          })}
        </RowGroup>
      )}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search event or file…"
        searchLabel="Search print jobs"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />

      {jobs === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <ListSummary testId="print-jobs-summary" order="The last 100 jobs, newest first within each group.">
            {shownJobs.length} job{shownJobs.length === 1 ? "" : "s"} · {count("failed")} failed · {count("queued")} in
            the queue
          </ListSummary>
          {shownJobs.length === 0 ? (
            <EmptyState>
              {narrowed
                ? "No print jobs match this search and these filters."
                : "Nothing has been printed yet. Print a brief or poster from an event."}
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {JOB_GROUPS.map((group) => {
                const groupJobs = shownJobs.filter((job) => group.statuses.includes(job.status));
                if (groupJobs.length === 0) return null;
                return (
                  <RowGroup
                    key={group.id}
                    testId={`print-group-${group.id}`}
                    className="border"
                    title={group.label}
                    count={groupJobs.length}
                    tone={group.id === "failed" ? "rose" : "neutral"}
                    description={group.description}
                  >
                    {groupJobs.map((job) => (
                      <ListRow
                        key={job._id}
                        data-testid={`print-job-${job._id}`}
                        href={`/dashboard/events/${job.eventId}`}
                        actions={
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={reprintingId === job._id}
                              onClick={() => void handleReprint(job)}
                            >
                              Reprint
                            </Button>
                            <RowMenu label={`More for ${job.fileName}`}>
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/events/${job.eventId}`}>Open event</Link>
                              </DropdownMenuItem>
                            </RowMenu>
                          </>
                        }
                      >
                        <RowText
                          eyebrow={`${JOB_KIND_LABELS[job.kind]} · queued ${formatDateTime(job.createdAt)}`}
                          title={job.eventTitle}
                          detail={
                            job.error
                              ? `Error: ${job.error}`
                              : [
                                  job.fileName,
                                  job.copies > 1 ? `${job.copies} copies` : null,
                                  job.printerName,
                                  job.attempts > 1 ? `${job.attempts} attempts` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                          }
                        />
                        <RowCell className="w-36" hideBelow="lg" muted>
                          {job.printedAt ? `Printed ${formatDateTime(job.printedAt)}` : "—"}
                        </RowCell>
                        <StatusPill
                          tone={JOB_STATUS_TONES[job.status]}
                          className="hidden h-6 w-24 shrink-0 justify-center sm:inline-flex"
                        >
                          {JOB_STATUS_LABELS[job.status]}
                        </StatusPill>
                      </ListRow>
                    ))}
                  </RowGroup>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
