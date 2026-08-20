"use client";

import { useState } from "react";
import type { ComponentRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { CommentsSection } from "@/components/comments/comments-section";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  optimisticDecommissionDamageReport,
  optimisticUpdateDamageStatus,
} from "@/lib/damage-reports-optimistic";
import { formatDateTime } from "@/lib/format";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
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
  const [error, setError] = useState<string | null>(null);
  // The sheet is a modal Radix layer, so the mention typeahead has to be
  // portaled inside it or its clicks are swallowed by the pointer-event trap.
  const [sheetElement, setSheetElement] = useState<ComponentRef<typeof SheetContent> | null>(
    null,
  );
  const details = useQuery(
    api.damageReports.getById,
    reportId && open ? { reportId } : "skip",
  );
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

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <SheetContent
        ref={setSheetElement}
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
        data-testid="damage-report-sheet"
      >
        <SheetHeader>
          <SheetTitle>
            {report ? `${report.assetId}${report.typeName ? ` · ${report.typeName}` : ""}` : "Damage report"}
          </SheetTitle>
          <SheetDescription>
            {report
              ? `Reported by ${report.reportedByName} on ${formatDateTime(report.reportedAt)}`
              : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        {details === undefined ? (
          <p className="px-4 text-sm text-muted-foreground">Loading…</p>
        ) : !report ? (
          <p className="px-4 text-sm text-muted-foreground">This damage report no longer exists.</p>
        ) : (
          <div className="space-y-4 px-4 pb-6">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="rounded-md border p-3">
              <DetailRow
                label="Status"
                value={
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        report.status === "resolved"
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {report.status.replace("_", " ")}
                    </span>
                    <span>
                      Severity {report.severity}/5 ·{" "}
                      <span className="capitalize">{report.operability.replace("_", " ")}</span>
                    </span>
                  </span>
                }
              />
              <DetailRow
                label="Event"
                value={
                  report.eventTitle ? (
                    <a className="underline" href={`/dashboard/events/${report.eventId}`}>
                      {report.eventTitle}
                    </a>
                  ) : (
                    "Unknown / not linked"
                  )
                }
              />
              <DetailRow label="Last updated" value={formatDateTime(report.updatedAt)} />
              {report.resolvedAt ? (
                <DetailRow label="Resolved" value={formatDateTime(report.resolvedAt)} />
              ) : null}
              {report.notes ? <DetailRow label="Notes" value={report.notes} /> : null}
            </div>

            {report.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={report.photoUrl}
                alt={`Damage photo for ${report.assetId}`}
                className="max-h-64 w-full rounded border object-contain"
              />
            ) : null}

            {siblings.length ? (
              <div className="space-y-1 rounded-md border p-3">
                <p className="text-sm font-medium">
                  Reported together ({siblings.length} other asset
                  {siblings.length === 1 ? "" : "s"})
                </p>
                <p className="text-xs text-muted-foreground">
                  These share this conversation, but are triaged individually.
                </p>
                <ul className="pt-1 text-sm text-muted-foreground">
                  {siblings.map((sibling) => (
                    <li key={sibling._id}>
                      {sibling.assetId}
                      {sibling.typeName ? ` · ${sibling.typeName}` : ""} —{" "}
                      <span className="capitalize">{sibling.status.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {canTriage && report.status !== "resolved" ? (
              <div className="flex flex-wrap gap-2">
                {report.status === "open" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void updateStatus({ reportId: report._id, status: "in_progress" }).catch(
                        (err) => setError(getConvexErrorMessage(err)),
                      )
                    }
                  >
                    Mark in progress
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    void updateStatus({ reportId: report._id, status: "resolved" }).catch((err) =>
                      setError(getConvexErrorMessage(err)),
                    )
                  }
                >
                  Resolve (repaired)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    void (async () => {
                      if (
                        !(await confirm({
                          title: `Decommission ${report.assetId}?`,
                          description: "It will be marked out of service and this report will close.",
                          confirmLabel: "Decommission",
                          destructive: true,
                        }))
                      ) {
                        return;
                      }
                      await decommission({ reportId: report._id }).catch((err) =>
                        setError(getConvexErrorMessage(err)),
                      );
                    })();
                  }}
                >
                  Decommission
                </Button>
              </div>
            ) : null}

            <CommentsSection
              subjectType="damage_batch"
              subjectId={report.threadId}
              menuContainer={sheetElement}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
