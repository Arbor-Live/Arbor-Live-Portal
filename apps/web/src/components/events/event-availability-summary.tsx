"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import {
  autoAssignRespondersToSchedule,
  addPartialResponderToMatchingBlocks,
  addYesResponderToAllBlocks,
  assignResponderToNextEmptyShift,
  fillEmptyShiftsFromResponses,
  type AssignableResponder,
  type ShiftDraftForAssign,
} from "@/lib/crew-shift-assign";
import {
  crewResponseBadgeClass,
  formatCrewResponseLabel,
  getAvailabilityNotesForDisplay,
} from "@/lib/crew-availability";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function EventScheduleCrewAssignPanel({
  eventId,
  blocks,
  shifts,
  onShiftsChange,
  getBlockRef,
}: {
  eventId: Id<"events">;
  blocks: TimelineBlockDraft[];
  shifts: ShiftDraftForAssign[];
  onShiftsChange: (next: ShiftDraftForAssign[]) => void;
  getBlockRef: (block: TimelineBlockDraft) => string | undefined;
}) {
  const summary = useQuery(api.eventCrewAvailability.getSummaryForEvent, { eventId });

  if (summary === undefined) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Loading crew availability...
      </div>
    );
  }

  if (!summary) return null;

  const responders = summary.assignableResponders as AssignableResponder[];
  const unfilledShifts = shifts.filter((shift) => !shift.userId?.trim()).length;
  const canFillEmpty = unfilledShifts > 0 && responders.length > 0;
  const canAutoAssign = blocks.length > 0 && responders.some((r) => r.responseStatus === "yes" || r.responseStatus === "partial");

  function apply(next: ShiftDraftForAssign[]) {
    onShiftsChange(next);
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Crew availability</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/events/crew-scheduling">Open crew scheduling</Link>
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Shift assignment</p>
          <p>
            {summary.filledShifts} / {summary.totalShifts} saved · {unfilledShifts} open in editor
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Available</p>
          <p>
            Yes {summary.responseCounts.yes} · Partial {summary.responseCounts.partial}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unavailable / backup</p>
          <p>
            No {summary.responseCounts.no} · Only if necessary {summary.responseCounts.onlyIfNecessary}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pending responses</p>
          <p>
            {summary.responseCounts.pending} of {summary.responseCounts.eligibleCrew}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!canAutoAssign}
          onClick={() => apply(autoAssignRespondersToSchedule(shifts, blocks, responders, getBlockRef))}
        >
          Auto-assign from responses
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canFillEmpty}
          onClick={() => apply(fillEmptyShiftsFromResponses(shifts, responders, blocks, getBlockRef))}
        >
          Fill {unfilledShifts} empty shift{unfilledShifts === 1 ? "" : "s"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Auto-assign fills open shift slots first, then spreads yes/partial responders across schedule blocks
        (up to 8 hours per person). Partial crew are placed on each declared window, then other blocks only when
        no windows were specified. Save schedule & personnel when done.
      </p>

      {responders.length === 0 ? (
        <p className="text-xs text-muted-foreground">No yes, partial, or backup responses yet.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Assign from responses</p>
          {responders.map((responder) => {
            const noteLines = getAvailabilityNotesForDisplay(responder);
            return (
            <div
              key={responder.userId}
              className="rounded-md border p-2 text-sm space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
              <Avatar size="sm">
                <AvatarImage src={responder.image} alt={responder.name} />
                <AvatarFallback>{initials(responder.name)}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{responder.name}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${crewResponseBadgeClass(responder.responseStatus)}`}
              >
                {formatCrewResponseLabel(responder.responseStatus)}
              </span>
              {responder.isAssigned ? (
                <span className="text-xs text-emerald-700">On schedule</span>
              ) : null}
              <div className="ml-auto flex flex-wrap gap-1">
                {unfilledShifts > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => apply(assignResponderToNextEmptyShift(shifts, responder))}
                  >
                    Next empty slot
                  </Button>
                ) : null}
                {responder.responseStatus === "yes" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={blocks.length === 0}
                    onClick={() =>
                      apply(addYesResponderToAllBlocks(shifts, blocks, responder, getBlockRef))
                    }
                  >
                    All blocks
                  </Button>
                ) : null}
                {responder.responseStatus === "partial" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={blocks.length === 0}
                    onClick={() =>
                      apply(addPartialResponderToMatchingBlocks(shifts, blocks, responder, getBlockRef))
                    }
                  >
                    Matching blocks
                  </Button>
                ) : null}
              </div>
              </div>
              {noteLines.length > 0 ? (
                <div className="space-y-1 border-t pt-2">
                  {noteLines.map((line, index) => (
                    <p key={index} className="text-xs text-muted-foreground italic whitespace-pre-wrap">
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
            );
          })}
        </div>
      )}

      {summary.isCrewConfirmed ? (
        <p className="text-xs text-emerald-700">All saved shift slots are assigned.</p>
      ) : summary.totalShifts === 0 && unfilledShifts === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add shift slots below, or use auto-assign to create shifts from yes responses.
        </p>
      ) : null}
    </div>
  );
}
