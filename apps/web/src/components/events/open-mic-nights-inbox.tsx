"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ListSummary, RowCell, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { StatusPill } from "@/components/page-header";
import { attempt, useSetOpenMicStatus } from "@/lib/open-mic-actions";
import { formatTime } from "@/lib/format";
import { formatNightStart, OPEN_MIC_MOVES, OPEN_MIC_STATUS } from "@/lib/open-mic-status";

type Night = FunctionReturnType<typeof api.openMic.listEvents>[number];

const PAST_PREVIEW = 5;

function nightDetail(night: Night) {
  if (night.status === "live") {
    const parts = [night.currentName ? `${night.currentName} on stage` : null, `${night.queuedCount} queued`];
    return parts.filter(Boolean).join(" · ");
  }
  if (night.status === "scheduled") {
    return night.runnerWindowOpen ? "Runner open" : `Runner opens ${formatTime(night.runnerOpensAt)}`;
  }
  return undefined;
}

function nightCount(night: Night) {
  return night.status === "scheduled" ? `${night.queuedCount} signed up` : `${night.performedCount} performed`;
}

export function OpenMicEventsInbox() {
  const { confirm } = useAppDialog();
  const nights = useQuery(api.openMic.listEvents, {});
  const setStatus = useSetOpenMicStatus();
  const updateEvent = useMutation(api.events.update);
  const [now] = useState(() => Date.now());
  const [showAllPast, setShowAllPast] = useState(false);

  const groups = useMemo(() => {
    const live: Night[] = [];
    const upcoming: Night[] = [];
    const past: Night[] = [];
    for (const night of nights ?? []) {
      if (night.status === "live") live.push(night);
      else if (night.status === "scheduled" && night.runnerClosesAt > now) upcoming.push(night);
      else past.push(night);
    }
    live.sort((a, b) => a.startAt - b.startAt);
    upcoming.sort((a, b) => a.startAt - b.startAt);
    past.sort((a, b) => b.startAt - a.startAt);
    return { live, upcoming, past };
  }, [nights, now]);

  async function turnOff(night: Night) {
    const ok = await confirm({
      title: `Turn off Open Mic on ${night.title}?`,
      description: "Queues stay archived in the runner.",
      confirmLabel: "Turn off Open Mic",
      destructive: true,
    });
    if (!ok) return;
    await attempt(() => updateEvent({ id: night._id, openMicEnabled: false }));
  }

  function renderRow(night: Night) {
    const status = OPEN_MIC_STATUS[night.status];
    const moves = OPEN_MIC_MOVES[night.status];
    const goLiveDisabled = !night.runnerWindowOpen;
    return (
      <ListRow
        key={night._id}
        href={`/dashboard/events/open-mic/${night._id}`}
        data-testid={`open-mic-event-${night._id}`}
        actions={
          <div className="flex items-center gap-1">
            {moves.next === "live" && night.runnerWindowOpen ? (
              <Button type="button" size="sm" onClick={() => void setStatus(night, "live")}>
                Go live
              </Button>
            ) : null}
            <RowMenu label={`More for ${night.title}`}>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/events/open-mic/${night._id}`}>Open runner</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/events/${night._id}`}>Open event</Link>
              </DropdownMenuItem>
              {moves.next || moves.canCancel ? <DropdownMenuSeparator /> : null}
              {moves.next === "live" ? (
                <DropdownMenuItem
                  disabled={goLiveDisabled}
                  title={goLiveDisabled ? `The runner opens at ${formatTime(night.runnerOpensAt)}.` : undefined}
                  onSelect={() => void setStatus(night, "live")}
                >
                  Go live
                </DropdownMenuItem>
              ) : null}
              {moves.next === "completed" ? (
                <DropdownMenuItem onSelect={() => void setStatus(night, "completed")}>Mark completed</DropdownMenuItem>
              ) : null}
              {moves.canCancel ? (
                <DropdownMenuItem onSelect={() => void setStatus(night, "cancelled")}>Cancel night</DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void turnOff(night)}>
                Turn off Open Mic
              </DropdownMenuItem>
            </RowMenu>
          </div>
        }
      >
        <RowText eyebrow={formatNightStart(night.startAt)} title={night.title} detail={nightDetail(night)} />
        <RowCell hideBelow="md" className="w-28" muted>
          {nightCount(night)}
        </RowCell>
        <span className="hidden w-28 shrink-0 justify-end md:flex">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </span>
      </ListRow>
    );
  }

  if (nights === undefined) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (nights.length === 0) {
    return (
      <EmptyState>
        No events have Open Mic turned on. Turn it on from an event&rsquo;s Add-ons.
      </EmptyState>
    );
  }

  const { live, upcoming, past } = groups;
  const summary = [
    live.length > 0 ? `${live.length} live` : null,
    upcoming.length > 0 ? `${upcoming.length} upcoming` : null,
    past.length > 0 ? `${past.length} past` : null,
  ].filter(Boolean);
  const visiblePast = showAllPast ? past : past.slice(0, PAST_PREVIEW);

  return (
    <div className="space-y-4" data-testid="open-mic-inbox-list">
      <ListSummary
        testId="open-mic-inbox-summary"
        order="Live first, then soonest first. Turn Open Mic on from an event's Add-ons."
      >
        {summary.join(" · ")}
      </ListSummary>

      {live.length > 0 ? (
        <RowGroup title="Live now" count={live.length} tone="emerald" className="border">
          {live.map(renderRow)}
        </RowGroup>
      ) : null}
      {upcoming.length > 0 ? (
        <RowGroup title="Upcoming" count={upcoming.length} className="border">
          {upcoming.map(renderRow)}
        </RowGroup>
      ) : null}
      {past.length > 0 ? (
        <RowGroup
          title="Past"
          count={past.length}
          className="border"
          aside={
            past.length > PAST_PREVIEW ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAllPast((open) => !open)}>
                {showAllPast ? "Show fewer" : `Show all ${past.length}`}
              </Button>
            ) : null
          }
        >
          {visiblePast.map(renderRow)}
        </RowGroup>
      ) : null}
    </div>
  );
}
