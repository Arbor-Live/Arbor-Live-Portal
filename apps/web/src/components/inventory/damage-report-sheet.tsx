"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { CommentsSection } from "@/components/comments/comments-section";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { StatusPill, StatusPillSelect } from "@/components/page-header";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  optimisticDecommissionDamageReport,
  optimisticUpdateDamageStatus,
} from "@/lib/damage-reports-optimistic";
import {
  DAMAGE_STATUS_LABELS,
  DAMAGE_STATUS_OPTIONS,
  damageStatusTone,
  OPERABILITY_LABELS,
  type DamageStatus,
} from "@/lib/damage-status";
import { formatDateTime } from "@/lib/format";
import { notify } from "@/lib/notify";

async function attempt(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    notify.success(success);
    return true;
  } catch (error) {
    notify.error(getConvexErrorMessage(error));
    return false;
  }
}

export function DamageReportSheet({
  reportId,
  open,
  onOpenChange,
}: {
  reportId: Id<"damageReports"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { confirm } = useAppDialog();
  const details = useQuery(api.damageReports.getById, reportId && open ? { reportId } : "skip");
  const updateStatus = useMutation(api.damageReports.updateStatus).withOptimisticUpdate(
    optimisticUpdateDamageStatus,
  );
  const decommission = useMutation(api.damageReports.decommission).withOptimisticUpdate(
    optimisticDecommissionDamageReport,
  );

  const viewer = useSessionViewer();
  const canTriage = Boolean(viewer?.isAdmin || viewer?.verticals?.includes("Operations"));

  const report = details?.report;
  const siblings = details?.siblings ?? [];
  const name = report ? [report.assetId, report.typeName].filter(Boolean).join(" · ") || "Damage report" : "Damage report";

  function setStatus(status: DamageStatus) {
    if (!report || status === report.status) return;
    void attempt(
      () => updateStatus({ reportId: report._id, status }),
      `Marked ${report.assetId ?? "the report"} ${DAMAGE_STATUS_LABELS[status].toLowerCase()}`,
    );
  }

  async function decommissionAsset() {
    if (!report) return;
    const ok = await confirm({
      title: `Decommission ${report.assetId ?? report.typeName ?? "this asset"}?`,
      description:
        "The asset is marked out of service and this report is resolved. Its history and comments stay.",
      confirmLabel: "Decommission",
      destructive: true,
    });
    if (!ok) return;
    await attempt(() => decommission({ reportId: report._id }), `Decommissioned ${report.assetId ?? "the asset"}`);
  }

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} testId="damage-report-sheet">
      <DetailSheetHeader
        title={name}
        pill={
          report ? (
            <StatusPillSelect
              value={report.status}
              options={DAMAGE_STATUS_OPTIONS}
              onChange={setStatus}
              disabled={!canTriage}
            />
          ) : null
        }
        description={
          report
            ? `Reported by ${report.reportedByName} on ${formatDateTime(report.reportedAt)}`
            : details === null
              ? undefined
              : "Loading…"
        }
      />

      {details === undefined ? (
        <p className="px-4 text-sm text-muted-foreground">Loading…</p>
      ) : !report ? (
        <p className="px-4 text-sm text-muted-foreground">This damage report no longer exists.</p>
      ) : (
        <>
          <SheetSection title="Details">
            <SheetFields>
              <SheetField label="Severity">{report.severity} of 5</SheetField>
              <SheetField label="Operability">{OPERABILITY_LABELS[report.operability]}</SheetField>
              <SheetField label="Event">
                {report.eventTitle && report.eventId ? (
                  <Link className="underline" href={`/dashboard/events/${report.eventId}`}>
                    {report.eventTitle}
                  </Link>
                ) : (
                  "Not linked to an event"
                )}
              </SheetField>
              <SheetField label="Last updated">{formatDateTime(report.updatedAt)}</SheetField>
              {report.resolvedAt ? <SheetField label="Resolved">{formatDateTime(report.resolvedAt)}</SheetField> : null}
              {report.notes ? <SheetField label="Notes">{report.notes}</SheetField> : null}
            </SheetFields>
            {report.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={report.photoUrl}
                alt={`Damage photo for ${report.assetId ?? report.typeName ?? "asset"}`}
                className="max-h-64 w-full border object-contain"
              />
            ) : null}
          </SheetSection>

          {siblings.length ? (
            <SheetSection title={`Reported together (${siblings.length})`}>
              <p className="text-xs text-muted-foreground">
                These share this conversation, but each is triaged on its own.
              </p>
              <ul className="divide-y border text-sm">
                {siblings.map((sibling) => (
                  <li key={sibling._id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate">
                      {sibling.assetId ?? "No ID"}
                      {sibling.typeName ? ` · ${sibling.typeName}` : ""}
                    </span>
                    <StatusPill tone={damageStatusTone(sibling.status)} className="h-6">
                      {DAMAGE_STATUS_LABELS[sibling.status]}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            </SheetSection>
          ) : null}

          {/* CommentsSection brings its own heading. */}
          <div className="border-t px-4 py-4">
            <CommentsSection subjectType="damage_batch" subjectId={report.threadId} />
          </div>

          {canTriage && report.status !== "resolved" ? (
            <DetailSheetFooter
              start={
                <Button type="button" variant="destructive" size="sm" onClick={() => void decommissionAsset()}>
                  Decommission
                </Button>
              }
            >
              {report.status === "open" ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setStatus("in_progress")}>
                  Mark in progress
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={() => setStatus("resolved")}>
                Resolve (repaired)
              </Button>
            </DetailSheetFooter>
          ) : null}
        </>
      )}
    </DetailSheet>
  );
}
