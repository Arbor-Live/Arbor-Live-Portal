"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { DamageReportSheet } from "@/components/inventory/damage-report-sheet";
import { DamageReportWizard } from "@/components/inventory/damage-report-wizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { formatDateTime } from "@/lib/format";

const SEVERITY_OPTIONS = [1, 2, 3, 4, 5].map((level) => ({ value: String(level), label: `${level} of 5` }));

const OPERABILITY_OPTIONS = [
  { value: "functional", label: "Still works" },
  { value: "needs_repair", label: "Needs repair" },
];

export function DamageQueueManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<"open" | "in_progress" | "resolved" | "all">(
    "open",
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const reports = useQuery(api.damageReports.list, {
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const allRows = useMemo(() => reports ?? [], [reports]);
  // The list is bounded (newest 500 per status), so the extra filters run here.
  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const distinct = (entries: Array<[string, string]>) =>
      [...new Map(entries).entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    return [
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
  const narrowed = Boolean(search.trim()) || Object.keys(activeFilters(filters)).length > 0;

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Damage & repair</h1>
          <p className="text-sm text-muted-foreground">
            Crew can report damage. Operations/admin triage the queue. Open a report to discuss it.
          </p>
        </div>
        <Button type="button" onClick={() => setWizardOpen(true)}>
          Report damage
        </Button>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search asset, type, event, reporter, notes…"
        searchLabel="Search damage reports"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      >
        <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
          {(["open", "in_progress", "resolved", "all"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={statusFilter === value ? "default" : "outline"}
              onClick={() => setStatusFilter(value)}
            >
              <span className="capitalize">
                {value === "all" ? "All" : value.replace("_", " ")}
              </span>
            </Button>
          ))}
        </div>
      </FilterBar>
      <p className="text-sm text-muted-foreground" data-testid="damage-summary">
        {rows.length} report{rows.length === 1 ? "" : "s"}
        {narrowed ? ` of ${allRows.length} ${statusFilter === "all" ? "in total" : statusFilter.replace("_", " ")}` : ""}
      </p>

      <div className="grid gap-3">
        {rows.map((report) => {
          const commentCount = commentCountByThread.get(report.threadId) ?? 0;
          return (
            <Card
              key={report._id}
              role="button"
              tabIndex={0}
              data-testid="damage-report-card"
              className="cursor-pointer transition-colors hover:border-foreground/30"
              onClick={() => openReport(report._id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                openReport(report._id);
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-baseline gap-2 text-base">
                  <span>
                    {report.assetId ?? "No ID"}
                    {report.typeName ? ` · ${report.typeName}` : ""}
                  </span>
                  {commentCount > 0 ? (
                    <span
                      className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground"
                      data-testid="damage-comment-count"
                    >
                      {commentCount} comment{commentCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Severity {report.severity}/5 ·{" "}
                  <span className="capitalize">{report.operability.replace("_", " ")}</span> ·{" "}
                  <span className="capitalize">{report.status.replace("_", " ")}</span>
                </p>
                <p>
                  Event: {report.eventTitle ?? "Unknown / not linked"}
                </p>
                <p>
                  Reported by {report.reportedByName} · {formatDateTime(report.reportedAt)}
                </p>
                {report.notes ? <p className="line-clamp-2">{report.notes}</p> : null}
              </CardContent>
            </Card>
          );
        })}
        {!rows.length ? (
          <div className="space-y-2 border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            <p>{narrowed ? "No reports match this search and these filters." : "No damage reports in this status."}</p>
            {narrowed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setFilters({});
                }}
              >
                Clear search and filters
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

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
