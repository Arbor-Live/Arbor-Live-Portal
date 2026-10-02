"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ChatCircleIcon, PlusIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { DamageReportSheet } from "@/components/inventory/damage-report-sheet";
import { DamageReportWizard } from "@/components/inventory/damage-report-wizard";
import { ListRow } from "@/components/list-row";
import { EmptyState, ListSummary, RowCell, RowList, RowMenu, RowText } from "@/components/list-page";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import {
  DAMAGE_STATUS_LABELS,
  DAMAGE_STATUS_OPTIONS,
  damageStatusTone,
  OPERABILITY_LABELS,
  severityTone,
  type DamageStatus,
} from "@/lib/damage-status";
import { formatDate } from "@/lib/format";

const SEVERITY_OPTIONS = [1, 2, 3, 4, 5].map((level) => ({ value: String(level), label: `${level} of 5` }));

const OPERABILITY_OPTIONS = Object.entries(OPERABILITY_LABELS).map(([value, label]) => ({ value, label }));

/** The queue opens on what still needs fixing. */
const DEFAULT_FILTERS: FilterState = { status: { operator: "is", values: ["open", "in_progress"] } };

/** Turns the Status chip into the statuses the server reads; `undefined` reads every status. */
function statusesFor(filter: FilterState[string] | undefined): DamageStatus[] | undefined {
  if (!filter?.values.length) return undefined;
  const picked = filter.values as DamageStatus[];
  if (filter.operator === "is") return picked;
  return DAMAGE_STATUS_OPTIONS.map((option) => option.value).filter((status) => !picked.includes(status));
}

function plural(count: number, noun: string) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

export function DamageQueueManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const applied = activeFilters(filters);
  const reports = useQuery(api.damageReports.list, { statuses: statusesFor(applied.status) });

  const allRows = useMemo(() => reports ?? [], [reports]);
  // Status filters on the server; the list is bounded (newest 500), so the rest run here.
  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const distinct = (entries: Array<[string, string]>) =>
      [...new Map(entries).entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    return [
      { id: "status", label: "Status", options: DAMAGE_STATUS_OPTIONS },
      { id: "severity", label: "Severity", options: SEVERITY_OPTIONS },
      { id: "operability", label: "Operability", options: OPERABILITY_OPTIONS, single: true },
      {
        id: "type",
        label: "Type",
        options: distinct(
          allRows.filter((row) => row.typeId).map((row) => [row.typeId!, row.typeName ?? "Unknown type"]),
        ),
      },
      {
        id: "event",
        label: "Event",
        options: [
          { value: "none", label: "Not linked to an event" },
          ...distinct(
            allRows.filter((row) => row.eventId).map((row) => [row.eventId!, row.eventTitle ?? "Unknown event"]),
          ),
        ],
      },
      {
        id: "reporter",
        label: "Reported by",
        options: distinct(allRows.map((row) => [row.reportedByUserId, row.reportedByName])),
      },
    ];
  }, [allRows]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter(
      (report) =>
        (!needle ||
          [report.assetId, report.typeName, report.eventTitle, report.reportedByName, report.notes].some((field) =>
            field?.toLowerCase().includes(needle),
          )) &&
        matchesFilter(filters.severity, String(report.severity)) &&
        matchesFilter(filters.operability, report.operability) &&
        matchesFilter(filters.type, report.typeId ?? "") &&
        matchesFilter(filters.event, report.eventId ?? "none") &&
        matchesFilter(filters.reporter, report.reportedByUserId),
    );
  }, [allRows, filters, search]);
  // Anything other than the default open queue counts as narrowed.
  const narrowed =
    Boolean(search.trim()) ||
    Object.keys(applied).some((id) => id !== "status") ||
    JSON.stringify(applied.status) !== JSON.stringify(DEFAULT_FILTERS.status);

  // `?report=` is what the mention email links to, so the open report is derived
  // from the URL rather than mirrored into state — a deep link and an in-page
  // click then go through exactly the same path.
  const selectedReportId = searchParams.get("report");

  function openReport(reportId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("report", reportId);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function closeReport() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("report");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/dashboard/inventory/damage", { scroll: false });
  }

  const threadIds = useMemo(() => rows.map((report) => report.threadId), [rows]);
  const commentCounts = useQuery(
    api.comments.countBySubjects,
    threadIds.length ? { subjectType: "damage_batch" as const, subjectIds: threadIds } : "skip",
  );
  const commentCountByThread = useMemo(
    () => new Map((commentCounts ?? []).map((row) => [row.subjectId, row.count])),
    [commentCounts],
  );

  const countByStatus = (status: DamageStatus) => rows.filter((row) => row.status === status).length;
  const statusCounts = DAMAGE_STATUS_OPTIONS.map((option) => ({
    label: option.label.toLowerCase(),
    count: countByStatus(option.value),
  })).filter((entry) => entry.count > 0);
  const needsRepair = rows.filter((row) => row.status !== "resolved" && row.operability === "needs_repair").length;

  return (
    <div className="space-y-4 pb-24" data-testid="damage-page">
      <PageHeader
        title="Damage & repair"
        description="Crew report damaged gear here, and Operations triage it. Open a report to change its status or discuss it."
        actions={
          <Button type="button" size="sm" onClick={() => setWizardOpen(true)}>
            <PlusIcon />
            Report damage
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search asset, type, event, reporter, notes…"
        searchLabel="Search damage reports"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />

      {reports === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <ListSummary testId="damage-summary" order="Newest first. Open a report for details, status and comments.">
            {plural(rows.length, "report")}
            {statusCounts.length > 1
              ? ` · ${statusCounts.map((entry) => `${entry.count} ${entry.label}`).join(" · ")}`
              : ""}
            {needsRepair ? ` · ${needsRepair} need${needsRepair === 1 ? "s" : ""} repair` : ""}
          </ListSummary>

          {rows.length ? (
            <RowList testId="damage-report-list">
              {rows.map((report) => {
                const commentCount = commentCountByThread.get(report.threadId) ?? 0;
                const name = report.assetId ?? "No ID";
                return (
                  <ListRow
                    key={report._id}
                    data-testid="damage-report-row"
                    onOpen={() => openReport(report._id)}
                    actions={
                      <RowMenu label={`More for ${name}`}>
                        <DropdownMenuItem onSelect={() => openReport(report._id)}>Open details</DropdownMenuItem>
                      </RowMenu>
                    }
                  >
                    <RowText
                      eyebrow={report.eventTitle ?? "No event"}
                      title={report.typeName ? `${name} · ${report.typeName}` : name}
                      detail={report.notes ?? OPERABILITY_LABELS[report.operability]}
                    />
                    {commentCount > 0 ? (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums"
                        title={plural(commentCount, "comment")}
                        data-testid="damage-comment-count"
                      >
                        <ChatCircleIcon className="size-3.5" aria-hidden />
                        {commentCount}
                        <span className="sr-only"> comment{commentCount === 1 ? "" : "s"}</span>
                      </span>
                    ) : null}
                    <RowCell className="w-20" align="left">
                      <StatusPill tone={severityTone(report.severity)} dot={false} className="h-6">
                        Sev {report.severity}/5
                      </StatusPill>
                    </RowCell>
                    <RowCell className="w-32" align="left" hideBelow="lg" muted>
                      {report.reportedByName}
                    </RowCell>
                    <RowCell className="w-24" hideBelow="md" muted>
                      {formatDate(report.reportedAt)}
                    </RowCell>
                    <RowCell className="w-28" align="left">
                      <StatusPill tone={damageStatusTone(report.status)} className="h-6">
                        {DAMAGE_STATUS_LABELS[report.status]}
                      </StatusPill>
                    </RowCell>
                  </ListRow>
                );
              })}
            </RowList>
          ) : (
            <EmptyState
              action={
                narrowed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilters(DEFAULT_FILTERS);
                    }}
                  >
                    Back to the open queue
                  </Button>
                ) : null
              }
            >
              {narrowed
                ? "No reports match this search and these filters."
                : "Nothing waiting for repair. Report damage when gear comes back broken."}
            </EmptyState>
          )}
        </>
      )}

      <DamageReportSheet
        reportId={selectedReportId as Id<"damageReports"> | null}
        open={Boolean(selectedReportId)}
        onOpenChange={(next) => {
          if (!next) closeReport();
        }}
      />

      <DamageReportWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
