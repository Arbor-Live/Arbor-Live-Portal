"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { DamageReportSheet } from "@/components/inventory/damage-report-sheet";
import { DamageReportWizard } from "@/components/inventory/damage-report-wizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export function DamageQueueManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<"open" | "in_progress" | "resolved" | "all">(
    "open",
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const reports = useQuery(api.damageReports.list, {
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const rows = useMemo(() => reports ?? [], [reports]);

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

      <div className="flex flex-wrap gap-2">
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
          <p className="text-sm text-muted-foreground">No damage reports in this filter.</p>
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
