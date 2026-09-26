"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  CalendarDotsIcon,
  CaretDownIcon,
  ClockIcon,
  LinkBreakIcon,
  PlusIcon,
  RepeatIcon,
  TrashIcon,
  UserPlusIcon,
  UsersThreeIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import {
  EventTimelineScheduler,
  type TimelineBlockDraft,
} from "@/components/events/event-timeline-scheduler";
import { EventScheduleCrewAssignPanel } from "@/components/events/event-availability-summary";
import {
  buildQuickAddScheduleBlocks,
  eventTypeHasCrewAssignment,
  reconcileShiftsForReplacedBlocks,
  shiftBelongsToBlock,
  shiftRowKey,
  shiftTimesMatchBlock,
  syncShiftsToBlockTimes,
} from "@/lib/event-schedule-draft";
import { getAvailabilityNotesForDisplay, localDateTimeInputToMs } from "@/lib/crew-availability";
import { formatDateTimeRange, payPeriodForDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ShiftDraft } from "@/components/events/workspace/event-draft";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";

const BLOCK_TYPE_STYLES: Record<TimelineBlockDraft["blockType"], string> = {
  setup: "border-status-blue-500/40 bg-status-blue-500/10 text-status-blue-700",
  show: "border-status-emerald-500/40 bg-status-emerald-500/10 text-status-emerald-700",
  strike: "border-status-amber-500/40 bg-status-amber-500/10 text-status-amber-700",
  custom: "border-border bg-muted text-muted-foreground",
};

type AvailabilityResponder = NonNullable<
  FunctionReturnType<typeof api.eventCrewAvailability.getSummaryForEvent>
>["assignableResponders"][number];

function formatInputRange(startsAt: string, endsAt: string) {
  const start = localDateTimeInputToMs(startsAt);
  const end = localDateTimeInputToMs(endsAt);
  if (start == null || end == null) return "";
  return formatDateTimeRange(start, end);
}

function ShiftRow({
  shift,
  block,
  userSelectOptions,
  availability,
  onChange,
  onRemove,
}: {
  shift: ShiftDraft;
  /** Unlinked shifts have no block: their time is always editable. */
  block?: TimelineBlockDraft;
  userSelectOptions: UserSelectOption[];
  availability?: AvailabilityResponder;
  onChange: (next: ShiftDraft) => void;
  onRemove: () => void;
}) {
  const [editingTime, setEditingTime] = useState(false);
  const availabilityNotes = shift.userId
    ? getAvailabilityNotesForDisplay(availability, { scheduleBlockId: shift.scheduleBlockId })
    : [];
  const showTimePicker = !block || editingTime;

  return (
    <div className="space-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-24">
          <Input
            placeholder="Role"
            value={shift.role}
            onChange={(e) => onChange({ ...shift, role: e.target.value })}
          />
        </div>
        {shift.crewApplicationId ? (
          <div className="flex h-9 min-w-0 flex-1 basis-40 items-center border bg-muted/40 px-3 text-sm">
            <span className="truncate font-medium">{shift.personName || "Trainee"}</span>
            <span className="ml-1.5 shrink-0 text-xs text-muted-foreground">trainee</span>
          </div>
        ) : (
          <div className="min-w-0 flex-1 basis-40">
            <UserSelect
              value={shift.userId ?? ""}
              onChange={(value) =>
                onChange({
                  ...shift,
                  userId: value || undefined,
                  personName:
                    (value ? userSelectOptions.find((option) => option.value === value)?.label : "") ??
                    shift.personName,
                })
              }
              options={userSelectOptions}
              emptyLabel="Open slot — pick crew"
              clearable
            />
          </div>
        )}
        {block ? (
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            className={cn(
              "shrink-0",
              shift.timesOverridden &&
                "border-status-amber-500/50 bg-status-amber-500/15 text-status-amber-800 hover:bg-status-amber-500/25 hover:text-status-amber-900",
            )}
            aria-label={shift.timesOverridden ? "Edit custom shift time" : "Edit shift time"}
            title={shift.timesOverridden ? "Custom shift time" : "Edit shift time"}
            onClick={() => setEditingTime((prev) => !prev)}
          >
            <ClockIcon className="size-4" weight={shift.timesOverridden ? "fill" : "regular"} />
          </Button>
        ) : null}
        {showTimePicker ? (
          <div className="min-w-0 flex-1 basis-48">
            <DateTimeRangePicker
              startValue={shift.startsAt}
              endValue={shift.endsAt}
              onChange={({ start, end }) => {
                if (!block) {
                  onChange({ ...shift, startsAt: start, endsAt: end });
                  return;
                }
                if (!start || !end) {
                  onChange({
                    ...shift,
                    startsAt: block.startsAt,
                    endsAt: block.endsAt,
                    timesOverridden: false,
                  });
                  return;
                }
                const timesOverridden = !shiftTimesMatchBlock({ startsAt: start, endsAt: end }, block);
                onChange({ ...shift, startsAt: start, endsAt: end, timesOverridden });
              }}
              placeholder="Shift start and end"
            />
          </div>
        ) : shift.timesOverridden ? (
          <span className="shrink-0 self-center text-xs text-status-amber-800 tabular-nums">
            {formatInputRange(shift.startsAt, shift.endsAt)}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove shift"
          onClick={onRemove}
        >
          <TrashIcon className="size-4" />
        </Button>
      </div>
      {availabilityNotes.length > 0 ? (
        <div className="border border-dashed bg-muted/30 px-2 py-1.5">
          <p className="text-2xs font-medium text-muted-foreground">Availability note</p>
          {availabilityNotes.map((line, noteIndex) => (
            <p key={noteIndex} className="text-xs whitespace-pre-wrap text-muted-foreground italic">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ScheduleCrewTab() {
  const {
    eventId,
    draft,
    readOnly,
    canEdit,
    seriesMeta,
    blocks,
    setBlocks,
    shifts,
    setShifts,
    withStableBlockRefs,
    getBlockRef,
    isShiftUnlinked,
    removeUnlinkedShifts,
    dayCount,
    userSelectOptions,
  } = useEventWorkspace();
  const [assignUserId, setAssignUserId] = useState("");
  const hasCrew = eventTypeHasCrewAssignment(draft.eventType);

  const [nowMs] = useState(() => Date.now());
  const payPeriod = useMemo(() => payPeriodForDate(nowMs), [nowMs]);
  const otForecast = useQuery(
    api.eventCrew.getOtForecastForUser,
    assignUserId && canEdit
      ? { userId: assignUserId, rangeStart: payPeriod.startMs, rangeEnd: payPeriod.endMs }
      : "skip",
  );
  const availabilitySummary = useQuery(
    api.eventCrewAvailability.getSummaryForEvent,
    hasCrew ? { eventId } : "skip",
  );
  const availabilityByUserId = useMemo(() => {
    const map = new Map<string, AvailabilityResponder>();
    for (const responder of availabilitySummary?.assignableResponders ?? []) {
      map.set(responder.userId, responder);
    }
    return map;
  }, [availabilitySummary]);

  const assignUser = userSelectOptions.find((option) => option.value === assignUserId);
  const quickAddDisabled = !draft.startAt || !draft.endAt;
  const quickAddLabel =
    draft.eventType === "Dry Hire"
      ? draft.rentalFulfillmentMode === "will_call"
        ? "Quick Add: Check-out + Return"
        : "Quick Add: Drop-off + Pickup"
      : draft.eventType === "Rental with Crew"
        ? "Quick Add: Setup + Strike"
        : "Quick Add: Setup + Show + Strike";

  const unlinkedShifts = shifts
    .map((shift, index) => ({ shift, index }))
    .filter(({ shift }) => isShiftUnlinked(shift));
  const filledCount = shifts.filter((shift) => shift.userId || shift.crewApplicationId).length;

  function addShift(block: TimelineBlockDraft, userId?: string) {
    const user = userId ? userSelectOptions.find((option) => option.value === userId) : undefined;
    setShifts((prev) => [
      ...prev,
      {
        scheduleBlockId: block.id as ShiftDraft["scheduleBlockId"],
        scheduleBlockRef: getBlockRef(block),
        role: "",
        userId: user?.value,
        personName: user?.label ?? "",
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        postedToExpense: false,
        notes: "",
      },
    ]);
  }

  function updateShift(index: number, next: ShiftDraft) {
    setShifts((prev) => prev.map((shift, i) => (i === index ? next : shift)));
  }

  function removeShift(index: number) {
    setShifts((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <fieldset disabled={readOnly} className="space-y-4">
      {seriesMeta ? (
        <p className="flex items-center gap-2 border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <RepeatIcon className="size-4 shrink-0" />
          Crew is scheduled separately for each occurrence in this series.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDotsIcon className="size-4 text-muted-foreground" />
            Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EventTimelineScheduler
            dayCount={dayCount}
            blocks={blocks}
            anchorStartsAt={draft.startAt}
            onChange={(next) => {
              const nextBlocks = withStableBlockRefs(next);
              setBlocks(nextBlocks);
              setShifts((prev) => syncShiftsToBlockTimes(prev, nextBlocks));
            }}
            readOnly={readOnly}
            quickAddLabel={quickAddLabel}
            quickAddDisabled={quickAddDisabled}
            quickAddDisabledReason={quickAddDisabled ? "Set event start and end first." : undefined}
            onQuickAdd={() => {
              if (quickAddDisabled) return;
              const nextBlocks = buildQuickAddScheduleBlocks({
                eventType: draft.eventType,
                startAt: draft.startAt,
                endAt: draft.endAt,
                rentalFulfillmentMode: draft.rentalFulfillmentMode,
                withStableRefs: withStableBlockRefs,
              });
              setBlocks(nextBlocks);
              setShifts((prev) => reconcileShiftsForReplacedBlocks(blocks, nextBlocks, prev));
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <UsersThreeIcon className="size-4 text-muted-foreground" />
            Crew
          </CardTitle>
          {shifts.length > 0 ? (
            <span
              className={cn(
                "text-sm tabular-nums",
                filledCount < shifts.length ? "text-status-amber-700" : "text-status-emerald-700",
              )}
            >
              {filledCount} / {shifts.length} slots filled
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 border bg-muted/30 p-2">
            <UserPlusIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium">Quick assign</span>
            <div className="min-w-56 flex-1">
              <UserSelect
                value={assignUserId}
                onChange={setAssignUserId}
                options={userSelectOptions}
                emptyLabel="Pick someone, then add them to blocks below"
                clearable
              />
            </div>
            {assignUserId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label="Clear quick assign"
                onClick={() => setAssignUserId("")}
              >
                <XIcon className="size-4" />
              </Button>
            ) : null}
            {otForecast?.hasOt || otForecast?.hasDt ? (
              <p className="flex basis-full items-center gap-1.5 text-xs text-status-amber-800">
                <WarningIcon className="size-3.5 shrink-0" weight="fill" />
                OT warning: {assignUser?.label ?? "this person"} may exceed pay-period limits
                {otForecast.hasDt ? " (including double-time days >12h)" : ""}
                {otForecast.otWeeks.length > 0 ? " or weekly hours >40" : ""}.
              </p>
            ) : null}
          </div>

          {hasCrew ? (
            <EventScheduleCrewAssignPanel
              eventId={eventId}
              blocks={blocks}
              shifts={shifts}
              onShiftsChange={setShifts}
              getBlockRef={getBlockRef}
            />
          ) : null}

          {blocks.length === 0 ? (
            <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              Add schedule blocks above to start staffing this event.
            </p>
          ) : (
            <div className="space-y-3">
              {blocks.map((block, blockIndex) => {
                const blockRef = getBlockRef(block);
                const blockShifts = shifts
                  .map((shift, index) => ({ shift, index }))
                  .filter(({ shift }) => shiftBelongsToBlock(shift, block));
                const blockFilled = blockShifts.filter(
                  ({ shift }) => shift.userId || shift.crewApplicationId,
                ).length;
                return (
                  <section key={blockRef ?? `block-${blockIndex}`} className="border">
                    <header className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
                      <span
                        className={cn(
                          "border px-1.5 py-0.5 text-2xs font-semibold tracking-wide uppercase",
                          BLOCK_TYPE_STYLES[block.blockType],
                        )}
                      >
                        {block.blockType}
                      </span>
                      <p className="min-w-0 truncate text-sm font-medium">
                        {block.label || `Block ${blockIndex + 1}`}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatInputRange(block.startsAt, block.endsAt)}
                      </p>
                      <div className="ml-auto flex shrink-0 items-center gap-1.5">
                        {blockShifts.length > 0 ? (
                          <span className="mr-1 text-xs text-muted-foreground tabular-nums">
                            {blockFilled}/{blockShifts.length}
                          </span>
                        ) : null}
                        {assignUser ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => addShift(block, assignUserId)}
                            title={`Add ${assignUser.label} to this block`}
                          >
                            <UserPlusIcon />
                            <span className="max-w-32 truncate">{assignUser.label}</span>
                          </Button>
                        ) : null}
                        <Button type="button" variant="outline" size="sm" onClick={() => addShift(block)}>
                          <PlusIcon />
                          Slot
                        </Button>
                      </div>
                    </header>
                    <div className="space-y-2 p-3">
                      {blockShifts.length ? (
                        blockShifts.map(({ shift, index }, rowIndex) => (
                          <ShiftRow
                            key={shiftRowKey(shift, blockRef, rowIndex)}
                            shift={shift}
                            block={block}
                            userSelectOptions={userSelectOptions}
                            availability={shift.userId ? availabilityByUserId.get(shift.userId) : undefined}
                            onChange={(next) => updateShift(index, next)}
                            onRemove={() => removeShift(index)}
                          />
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No crew on this block yet.</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {unlinkedShifts.length > 0 ? (
            <Collapsible
              defaultOpen
              className="border border-status-amber-500/30 bg-status-amber-500/10"
            >
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-status-amber-800">
                <LinkBreakIcon className="size-4 shrink-0" />
                <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-left">
                  <span>
                    {unlinkedShifts.length} shift{unlinkedShifts.length === 1 ? " is" : "s are"} not
                    linked to a schedule block (common for trainees assigned as entire event / first 8
                    hours). They still count as scheduled.
                  </span>
                  <CaretDownIcon className="size-3.5 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
                </CollapsibleTrigger>
                <Button type="button" variant="outline" size="sm" onClick={() => void removeUnlinkedShifts()}>
                  Delete Unassigned Shifts
                </Button>
              </div>
              <CollapsibleContent className="space-y-2 border-t border-status-amber-500/20 p-3">
                {unlinkedShifts.map(({ shift, index }) => (
                  <ShiftRow
                    key={shift.id ?? `unlinked-${index}`}
                    shift={shift}
                    userSelectOptions={userSelectOptions}
                    availability={shift.userId ? availabilityByUserId.get(shift.userId) : undefined}
                    onChange={(next) => updateShift(index, next)}
                    onRemove={() => removeShift(index)}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </CardContent>
      </Card>
    </fieldset>
  );
}
