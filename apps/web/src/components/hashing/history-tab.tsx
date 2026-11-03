"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { CorrectAttendanceDialog, type AttendanceTarget } from "@/components/hashing/correct-attendance-dialog";
import { EmptyState, ListSummary, RowCell, RowFlag, RowGroup, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, plural } from "@/lib/format";
import { FLAG_REASON_LABELS } from "@/lib/hashing";
import { hashPath } from "@/lib/hashing-tabs";
import { notify } from "@/lib/notify";

function ResolveButton({ checkId }: { checkId: Id<"hashChecks"> }) {
  const resolveFlag = useMutation(api.hashingLive.resolveFlag);
  const [saving, setSaving] = useState(false);

  async function resolve() {
    setSaving(true);
    try {
      await resolveFlag({ checkId });
      notify.success("Flag resolved.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't resolve this flag."));
      setSaving(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={saving} data-testid="hash-resolve" onClick={() => void resolve()}>
      Resolve
    </Button>
  );
}

export function HistoryTab() {
  const history = useQuery(api.hashingLive.getHistory, {});
  const [correcting, setCorrecting] = useState<AttendanceTarget | null>(null);
  if (history === undefined) return <Skeleton className="h-48 w-full" />;
  const { finished, lapsed, flags } = history;

  return (
    <div className="space-y-4" data-testid="hash-history">
      <ListSummary testId="hash-history-summary">
        {plural(finished.length, "finished hash", "finished hashes")} · {plural(flags.length, "open flag")}
        {history.flagsCapped ? " (oldest shown first; resolve some to see the rest)" : ""}
      </ListSummary>

      {flags.length > 0 ? (
        <RowGroup title="Open flags" count={flags.length} tone="amber" testId="hash-open-flags">
          {flags.map((flag) => (
            <ListRow
              key={flag._id}
              data-testid="hash-flag-row"
              href={hashPath(flag.hashDateId)}
              actions={
                <div className="flex shrink-0 items-center gap-1">
                  {flag.damageReportId ? (
                    <Button size="sm" variant="ghost" className="hidden sm:inline-flex" asChild>
                      <Link href={`/dashboard/inventory/damage?report=${flag.damageReportId}`}>Damage report</Link>
                    </Button>
                  ) : null}
                  <ResolveButton checkId={flag._id} />
                </div>
              }
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                  {flag.areaName} · {formatDate(flag.hashStartsAt)}
                </p>
                <p className="font-medium break-words">{flag.text}</p>
                <p className="text-xs break-words text-muted-foreground">
                  {[flag.note, flag.byName].filter(Boolean).join(" · ")}
                </p>
              </div>
              {flag.reason ? <RowFlag>{FLAG_REASON_LABELS[flag.reason]}</RowFlag> : null}
            </ListRow>
          ))}
        </RowGroup>
      ) : null}

      {finished.length > 0 ? (
        <RowGroup title="Finished" count={finished.length} testId="hash-finished">
          {finished.map((row) => (
            <ListRow
              key={row._id}
              data-testid="hash-finished-row"
              href={hashPath(row._id)}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="hash-correct"
                  onClick={() => setCorrecting({ hashDateId: row._id, startsAt: row.startsAt, lapsed: false })}
                >
                  Correct
                </Button>
              }
            >
              <RowText title={formatDate(row.startsAt)} detail={row.people.join(", ") || "Nobody booked"} />
              {row.counts && row.counts.flagged > 0 ? <RowFlag>{plural(row.counts.flagged, "flag")}</RowFlag> : null}
              {row.counts ? (
                <RowCell className="w-20" hideBelow="sm">
                  {row.counts.checked} of {row.counts.total}
                </RowCell>
              ) : null}
            </ListRow>
          ))}
        </RowGroup>
      ) : (
        <EmptyState>No finished hashes yet.</EmptyState>
      )}

      {lapsed.length > 0 ? (
        <RowGroup title="Never ran" count={lapsed.length} testId="hash-lapsed">
          {lapsed.map((row) => (
            <ListRow
              key={row._id}
              data-testid="hash-lapsed-row"
              href={hashPath(row._id)}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="hash-mark-done"
                  onClick={() => setCorrecting({ hashDateId: row._id, startsAt: row.startsAt, lapsed: true })}
                >
                  Mark as done
                </Button>
              }
            >
              <RowText title={formatDate(row.startsAt)} />
            </ListRow>
          ))}
        </RowGroup>
      ) : null}

      <CorrectAttendanceDialog target={correcting} onClose={() => setCorrecting(null)} />
    </div>
  );
}
