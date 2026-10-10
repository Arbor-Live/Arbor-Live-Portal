"use client";

import Link from "next/link";
import { memo, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "convex/react";
import {
  CalendarXIcon,
  CaretDownIcon,
  ClockIcon,
  GraduationCapIcon,
  LightningIcon,
  LinkBreakIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { TypeChip } from "@/components/events/workspace/run-of-show/run-of-show-styles";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import {
  annotateOptionsForWindow,
  CONFLICT_CLASS,
  LEVEL_CLASSES,
  LEVEL_LABELS,
} from "@/components/events/crew-staffing/availability-level";
import {
  formatTimeWindow,
  getAvailabilityNotesForDisplay,
  localDateTimeInputToMs,
  sectionAvailability,
  type SectionForAvailability,
} from "@/lib/crew-availability";
import {
  assignPersonToSection,
  conflictsDuring,
  fillOpenSlotsFromAvailability,
  rankCandidatesForSection,
  sectionWindow,
  setSectionHeadcount,
  type AssignableResponder,
  type CrewConflict,
  type ShiftDraftForAssign,
} from "@/lib/crew-shift-assign";
import { countStaffing, isOpenSlot, isTraineeShift } from "@/lib/crew-shift-kinds";
import { shiftBelongsToBlock, shiftTimesMatchBlock } from "@/lib/event-schedule-draft";
import { formatDate, formatDateTimeRange } from "@/lib/format";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

const CHIP_LIMIT = 8;

type IndexedShift<S> = { shift: S; index: number };

function inputRangeLabel(startsAt: string, endsAt: string) {
  const start = localDateTimeInputToMs(startsAt);
  const end = localDateTimeInputToMs(endsAt);
  if (start == null || end == null) return "";
  return formatDateTimeRange(start, end);
}

function shiftWindow(shift: { startsAt: string; endsAt: string }): SectionForAvailability | null {
  const startsAt = localDateTimeInputToMs(shift.startsAt);
  const endsAt = localDateTimeInputToMs(shift.endsAt);
  if (startsAt == null || endsAt == null || endsAt <= startsAt) return null;
  return { startsAt, endsAt };
}

/**
 * Staffing for an event: one group per crew section with its headcount, the
 * people on it, and who's available to add. Shared by the event Schedule tab
 * and the invoice crew section. Edits stay in the caller's draft until saved.
 * Memoized: it's heavy, and sits under the run of show, whose every keystroke
 * re-renders the parent.
 */
export const CrewStaffingBoard = memo(CrewStaffingBoardImpl) as typeof CrewStaffingBoardImpl;

function CrewStaffingBoardImpl<S extends ShiftDraftForAssign>({
  eventId,
  sectionBlocks,
  shifts,
  setShifts,
  getBlockRef,
  userSelectOptions,
  askAvailability,
  readOnly = false,
  onDeleteUnlinked,
  openSlotNote,
}: {
  eventId: Id<"events">;
  sectionBlocks: TimelineBlockDraft[];
  shifts: S[];
  setShifts: Dispatch<SetStateAction<S[]>>;
  getBlockRef: (block: TimelineBlockDraft) => string | undefined;
  userSelectOptions: UserSelectOption[];
  /** Crewed event types ask crew for availability; others just staff slots. */
  askAvailability: boolean;
  readOnly?: boolean;
  onDeleteUnlinked?: () => void;
  /** Extra line under open slots (the invoice shows the billed rate). */
  openSlotNote?: string;
}) {
  const summary = useQuery(
    api.eventCrewAvailability.getSummaryForEvent,
    askAvailability ? { eventId } : "skip",
  );
  const pending = useQuery(
    api.eventCrewAvailability.listPendingCrewForEvent,
    askAvailability ? { eventId } : "skip",
  );
  const responders = useMemo(
    () => (summary?.responders ?? []) as AssignableResponder[],
    [summary],
  );
  const responderById = useMemo(
    () => new Map(responders.map((responder) => [responder.userId, responder])),
    [responders],
  );

  // Draft assignees are the only conflict people known on first render. The
  // query folds in this event's availability responders server-side, so it
  // does not wait on `summary` — that dependency made conflicts a second
  // round-trip behind the summary query.
  const shiftUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const shift of shifts) {
      const userId = shift.userId?.trim();
      if (userId) ids.add(userId);
    }
    return [...ids].sort();
  }, [shifts]);
  const conflictsResult = useQuery(
    api.eventCrew.listCrewConflictsForEvent,
    shiftUserIds.length > 0 || askAvailability ? { eventId, userIds: shiftUserIds } : "skip",
  );
  const conflicts: CrewConflict[] = useMemo(() => conflictsResult?.conflicts ?? [], [conflictsResult]);
  const uncheckedUserIds = conflictsResult?.uncheckedUserIds ?? [];

  // Every key a shift can link to a block by (client ref or stored block id),
  // so "not linked to a section" is one Set lookup per shift instead of a
  // scan over every block.
  const blockKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const block of sectionBlocks) {
      const ref = getBlockRef(block);
      if (ref) keys.add(ref);
      if (block.id) keys.add(block.id);
    }
    return keys;
  }, [sectionBlocks, getBlockRef]);
  const { indexed, trainees, unlinked } = useMemo(() => {
    const indexed = shifts.map((shift, index) => ({ shift, index }));
    return {
      indexed,
      trainees: indexed.filter(({ shift }) => isTraineeShift(shift)),
      unlinked: indexed.filter(
        ({ shift }) =>
          !isTraineeShift(shift) &&
          !blockKeys.has(shift.scheduleBlockRef ?? "") &&
          !blockKeys.has(shift.scheduleBlockId ?? ""),
      ),
    };
  }, [shifts, blockKeys]);
  const backupUserIds = useMemo(
    () =>
      new Set(
        responders
          .filter((responder) => responder.responseStatus === "only_if_necessary")
          .map((responder) => responder.userId),
      ),
    [responders],
  );
  const staffing = useMemo(() => countStaffing(shifts, backupUserIds), [shifts, backupUserIds]);
  const stillLooking = staffing.open > 0 || staffing.backup > 0;

  const assignedUsers = useMemo(() => {
    const byId = new Map<string, { name: string; windows: SectionForAvailability[] }>();
    for (const shift of shifts) {
      const userId = shift.userId?.trim();
      if (!userId) continue;
      const person = byId.get(userId) ?? { name: shift.personName || userId, windows: [] };
      const window = shiftWindow(shift);
      if (window) person.windows.push(window);
      byId.set(userId, person);
    }
    return [...byId.entries()].map(([userId, person]) => ({ userId, ...person }));
  }, [shifts]);

  function updateShift(index: number, next: S) {
    setShifts((prev) => prev.map((shift, i) => (i === index ? next : shift)));
  }

  function removeShift(index: number) {
    setShifts((prev) => prev.filter((_, i) => i !== index));
  }

  function fillOpenSlots() {
    const result = fillOpenSlotsFromAvailability({
      shifts,
      blocks: sectionBlocks,
      responders,
      conflicts,
      getBlockRef,
    });
    if (result.filled === 0) {
      notify.info("No one who's available is free for the open slots. Pick people by hand.");
      return;
    }
    setShifts(result.shifts);
    const left = staffing.open - result.filled;
    notify.success(
      `Filled ${result.filled} slot${result.filled === 1 ? "" : "s"}${
        left > 0 ? `, ${left} still open` : ""
      }. Save to keep them.`,
    );
  }

  return (
    <div className="space-y-3" data-testid="crew-staffing-board">
      <div className="space-y-2 border bg-muted/20 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm" data-testid="crew-staffing-summary">
            {staffing.slots === 0 ? (
              <span className="text-muted-foreground">No crew slots yet</span>
            ) : (
              <>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    stillLooking ? "text-status-amber-700" : "text-status-emerald-700",
                  )}
                >
                  {staffing.filled} of {staffing.slots} filled
                </span>
                {staffing.open > 0 ? ` · ${staffing.open} open` : null}
                {staffing.backup > 0 ? ` · ${staffing.backup} on backup` : null}
                {stillLooking ? null : " · fully staffed"}
              </>
            )}
            {trainees.length > 0
              ? ` · ${trainees.length} trainee${trainees.length === 1 ? "" : "s"}`
              : null}
          </p>
          {askAvailability && !readOnly ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="sm:ml-auto"
              disabled={staffing.open === 0 || responders.length === 0}
              title="Put available crew on open slots, section by section. Skips anyone booked elsewhere."
              onClick={fillOpenSlots}
            >
              <LightningIcon />
              Fill open slots
            </Button>
          ) : null}
        </div>
        {askAvailability ? (
          <AvailabilityLine
            summary={summary}
            pending={pending}
          />
        ) : null}
        {/* Mounted up front so the notice is announced when it appears. */}
        <div aria-live="polite">
          {uncheckedUserIds.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Double bookings weren&apos;t checked for {uncheckedUserIds.length}{" "}
              {uncheckedUserIds.length === 1 ? "person" : "people"}.
            </p>
          ) : null}
        </div>
        {assignedUsers.length > 0 ? (
          <div className="space-y-1">
            {assignedUsers.map((person) => (
              <OvertimeRisk
                key={person.userId}
                eventId={eventId}
                userId={person.userId}
                name={person.name}
                shifts={person.windows}
              />
            ))}
          </div>
        ) : null}
      </div>

      {sectionBlocks.length === 0 ? (
        <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Add sections to the run of show (setup, show, strike) to start staffing this event.
        </p>
      ) : (
        sectionBlocks.map((block, blockIndex) => (
          <SectionStaffing
            key={getBlockRef(block) ?? `block-${blockIndex}`}
            block={block}
            blockIndex={blockIndex}
            rows={indexed.filter(
              ({ shift }) => !isTraineeShift(shift) && shiftBelongsToBlock(shift, block),
            )}
            trainees={trainees.filter(({ shift }) => shiftBelongsToBlock(shift, block))}
            shifts={shifts}
            setShifts={setShifts}
            getBlockRef={getBlockRef}
            userSelectOptions={userSelectOptions}
            responders={responders}
            responderById={responderById}
            conflicts={conflicts}
            askAvailability={askAvailability}
            readOnly={readOnly}
            openSlotNote={openSlotNote}
            onChange={updateShift}
            onRemove={removeShift}
          />
        ))
      )}

      {trainees.length > 0 ? (
        <section className="border" data-testid="crew-trainees">
          <header className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
            <GraduationCapIcon className="size-4 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Trainees</p>
            <p className="text-xs text-muted-foreground">
              Shadowing only. They don&apos;t fill slots and aren&apos;t paid or billed.
            </p>
            <Button asChild variant="ghost" size="sm" className="ml-auto">
              <Link href="/dashboard/users/crew-applications">Assign trainees</Link>
            </Button>
          </header>
          <ul className="divide-y">
            {trainees.map(({ shift, index }) => {
              const block = sectionBlocks.find((candidate) => shiftBelongsToBlock(shift, candidate));
              return (
                <li key={shift.id ?? `trainee-${index}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {shift.personName || "Trainee"}
                  </span>
                  <span className="hidden text-xs text-muted-foreground md:block">
                    {block ? block.label || block.blockType : "Across sections"}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {inputRangeLabel(shift.startsAt, shift.endsAt)}
                  </span>
                  {!readOnly ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove trainee ${shift.personName || ""}`.trim()}
                      onClick={() => removeShift(index)}
                    >
                      <TrashIcon />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {unlinked.length > 0 ? (
        <Collapsible defaultOpen className="border border-status-amber-500/30 bg-status-amber-500/10">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-status-amber-800">
            <LinkBreakIcon className="size-4 shrink-0" aria-hidden />
            <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-left">
              <span>
                {unlinked.length} shift{unlinked.length === 1 ? " is" : "s are"} not linked to a
                section. Move {unlinked.length === 1 ? "it" : "them"} onto a section or delete.
              </span>
              <CaretDownIcon className="size-3.5 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
            </CollapsibleTrigger>
            {onDeleteUnlinked && !readOnly ? (
              <Button type="button" variant="outline" size="sm" onClick={onDeleteUnlinked}>
                Delete unlinked shifts
              </Button>
            ) : null}
          </div>
          <CollapsibleContent className="space-y-2 border-t border-status-amber-500/20 p-3">
            {unlinked.map(({ shift, index }) => (
              <ShiftRow
                key={shift.id ?? `unlinked-${index}`}
                shift={shift}
                window={shiftWindow(shift)}
                userSelectOptions={userSelectOptions}
                responderById={responderById}
                conflicts={conflicts}
                askAvailability={askAvailability}
                readOnly={readOnly}
                openSlotNote={openSlotNote}
                onChange={(next) => updateShift(index, next)}
                onRemove={() => removeShift(index)}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function AvailabilityLine({
  summary,
  pending,
}: {
  summary:
    | { responseCounts: { yes: number; partial: number; onlyIfNecessary: number; no: number } }
    | null
    | undefined;
  pending: { eligibleCrew: number; pendingCrew: Array<{ userId: string; name: string }> } | null | undefined;
}) {
  if (summary === undefined) {
    return <p className="text-xs text-muted-foreground">Loading crew availability…</p>;
  }
  const counts = summary?.responseCounts;
  const parts = counts
    ? [
        counts.yes ? `${counts.yes} yes` : null,
        counts.partial ? `${counts.partial} part` : null,
        counts.onlyIfNecessary ? `${counts.onlyIfNecessary} backup` : null,
        counts.no ? `${counts.no} no` : null,
      ].filter(Boolean)
    : [];
  const waiting = pending?.pendingCrew ?? [];
  return (
    <Collapsible>
      <div
        className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground"
        data-testid="crew-availability-line"
      >
        <span>Availability:</span>
        <span className="text-foreground">{parts.length > 0 ? parts.join(" · ") : "no answers yet"}</span>
        {pending === undefined ? null : waiting.length > 0 ? (
          <CollapsibleTrigger className="group inline-flex items-center gap-1 underline-offset-2 hover:underline">
            · waiting on {waiting.length} of {pending?.eligibleCrew ?? waiting.length}
            <CaretDownIcon className="size-3 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
        ) : pending ? (
          <span>· everyone on the team answered</span>
        ) : null}
        <Link
          href="/dashboard/events/crew-scheduling"
          className="ml-auto underline-offset-2 hover:underline"
        >
          Crew scheduling board
        </Link>
      </div>
      <CollapsibleContent>
        <p className="pt-1 text-xs text-muted-foreground">
          Hasn&apos;t answered: {waiting.map((person) => person.name).join(", ")}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function OvertimeRisk({
  eventId,
  userId,
  name,
  shifts,
}: {
  eventId: Id<"events">;
  userId: string;
  name: string;
  shifts: SectionForAvailability[];
}) {
  const forecast = useQuery(
    api.eventCrew.getOtForecastForUser,
    shifts.length > 0 ? { eventId, userId, shifts } : "skip",
  );
  if (!forecast?.hasOt && !forecast?.hasDt) return null;
  const longDays = [...forecast.dtDays, ...forecast.otDays]
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
    .map((day) => `${dayLabel(day.dayKey)} (${day.hours}h)`);
  return (
    <p className="flex items-center gap-1.5 text-xs text-status-amber-800">
      <WarningIcon className="size-3.5 shrink-0" weight="fill" aria-hidden />
      Overtime: {name}
      {longDays.length > 0 ? ` works over 8h on ${longDays.join(", ")}` : ""}
      {longDays.length > 0 && forecast.otWeeks.length > 0 ? " and" : ""}
      {forecast.otWeeks.length > 0 ? " goes over 40h that week" : ""}
      {forecast.hasDt ? ", past 12h is double time" : ""}.
    </p>
  );
}

function dayLabel(dayKey: string) {
  const ms = localDateTimeInputToMs(`${dayKey}T12:00`);
  return ms == null ? dayKey : formatDate(ms);
}

function SectionStaffing<S extends ShiftDraftForAssign>({
  block,
  blockIndex,
  rows,
  trainees,
  shifts,
  setShifts,
  getBlockRef,
  userSelectOptions,
  responders,
  responderById,
  conflicts,
  askAvailability,
  readOnly,
  openSlotNote,
  onChange,
  onRemove,
}: {
  block: TimelineBlockDraft;
  blockIndex: number;
  rows: Array<IndexedShift<S>>;
  trainees: Array<IndexedShift<S>>;
  shifts: S[];
  setShifts: Dispatch<SetStateAction<S[]>>;
  getBlockRef: (block: TimelineBlockDraft) => string | undefined;
  userSelectOptions: UserSelectOption[];
  responders: AssignableResponder[];
  responderById: Map<string, AssignableResponder>;
  conflicts: CrewConflict[];
  askAvailability: boolean;
  readOnly: boolean;
  openSlotNote?: string;
  onChange: (index: number, next: S) => void;
  onRemove: (index: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const window = sectionWindow(block);
  const label = block.label || `Section ${blockIndex + 1}`;
  const filled = rows.filter(({ shift }) => !isOpenSlot(shift)).length;
  const headcount = rows.length;

  const candidates = useMemo(
    () =>
      askAvailability
        ? rankCandidatesForSection({
            block,
            people: responders.map((responder) => ({
              userId: responder.userId,
              name: responder.name,
              image: responder.image,
            })),
            responders,
            shifts,
            conflicts,
            getBlockRef,
          }).filter(
            (candidate) =>
              candidate.level === "available" ||
              candidate.level === "part" ||
              candidate.level === "backup",
          )
        : [],
    [askAvailability, block, responders, shifts, conflicts, getBlockRef],
  );
  const visibleCandidates = showAll ? candidates : candidates.slice(0, CHIP_LIMIT);

  const addOptions = useMemo(() => {
    const onSection = new Set(rows.map(({ shift }) => shift.userId).filter(Boolean));
    return annotateOptionsForWindow({
      options: userSelectOptions.filter((option) => !onSection.has(option.value)),
      window,
      responderById,
      conflicts,
      askAvailability,
    });
  }, [rows, userSelectOptions, window, responderById, conflicts, askAvailability]);

  function assign(person: { userId: string; name: string }) {
    setShifts((prev) => assignPersonToSection(prev, block, person, getBlockRef));
  }

  function setHeadcount(next: number) {
    setShifts((prev) => setSectionHeadcount(prev, block, next, getBlockRef));
  }

  return (
    <section className="border" data-testid="crew-section">
      <header className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <TypeChip type={block.blockType} />
        <p className="min-w-0 truncate text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {inputRangeLabel(block.startsAt, block.endsAt)}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "text-xs tabular-nums",
              headcount === 0
                ? "text-muted-foreground"
                : filled < headcount
                  ? "text-status-amber-700"
                  : "text-status-emerald-700",
            )}
            data-testid="crew-section-count"
          >
            {filled}/{headcount} filled
          </span>
          {!readOnly ? (
            <div className="flex items-center border" role="group" aria-label={`Crew needed for ${label}`}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`One fewer crew slot on ${label}`}
                title={filled >= headcount ? "Remove someone first" : "Remove an open slot"}
                disabled={headcount <= filled}
                onClick={() => setHeadcount(headcount - 1)}
              >
                <MinusIcon weight="bold" />
              </Button>
              <span className="min-w-14 px-1 text-center text-xs tabular-nums">
                {headcount} needed
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`One more crew slot on ${label}`}
                onClick={() => setHeadcount(headcount + 1)}
              >
                <PlusIcon weight="bold" />
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="space-y-2 p-3">
        {rows.length > 0 ? (
          rows.map(({ shift, index }) => (
            <ShiftRow
              key={shift.id ?? `${getBlockRef(block) ?? blockIndex}-shift-${index}`}
              shift={shift}
              block={block}
              window={window}
              userSelectOptions={userSelectOptions}
              responderById={responderById}
              conflicts={conflicts}
              askAvailability={askAvailability}
              readOnly={readOnly}
              openSlotNote={openSlotNote}
              onChange={(next) => onChange(index, next)}
              onRemove={() => onRemove(index)}
            />
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            No crew on this section. Use + to say how many people it needs.
          </p>
        )}

        {trainees.length > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GraduationCapIcon className="size-3.5" aria-hidden />
            Shadowing: {trainees.map(({ shift }) => shift.personName || "Trainee").join(", ")}
          </p>
        ) : null}

        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
            {askAvailability ? (
              <>
                <span className="text-xs text-muted-foreground">
                  {candidates.length > 0 ? "Can work this:" : "No one else has said they can work this."}
                </span>
                {visibleCandidates.map((candidate) => {
                  const booked = candidate.conflicts.length > 0;
                  const title = [
                    LEVEL_LABELS[candidate.level],
                    candidate.detail,
                    booked
                      ? `Booked on ${candidate.conflicts.map((conflict) => conflict.eventTitle).join(", ")}`
                      : null,
                    candidate.responder?.scheduleChanged ? "Answered before the schedule changed" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <button
                      key={candidate.userId}
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:brightness-95",
                        booked ? CONFLICT_CLASS : LEVEL_CLASSES[candidate.level],
                      )}
                      title={`Add to ${label}. ${title}`}
                      data-testid="crew-candidate"
                      onClick={() => assign({ userId: candidate.userId, name: candidate.name })}
                    >
                      {booked ? (
                        <CalendarXIcon className="size-3.5" weight="bold" aria-hidden />
                      ) : (
                        <PlusIcon className="size-3" weight="bold" aria-hidden />
                      )}
                      {candidate.name}
                      {booked ? (
                        <span className="opacity-75">
                          · booked {candidate.conflicts.map((conflict) => formatTimeWindow(conflict)).join(", ")}
                        </span>
                      ) : candidate.level !== "available" ? (
                        <span className="opacity-75">· {LEVEL_LABELS[candidate.level].toLowerCase()}</span>
                      ) : null}
                    </button>
                  );
                })}
                {candidates.length > CHIP_LIMIT ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll((prev) => !prev)}
                  >
                    {showAll ? "Show fewer" : `+${candidates.length - CHIP_LIMIT} more`}
                  </Button>
                ) : null}
              </>
            ) : null}
            <div className="ml-auto min-w-56">
              <UserSelect
                value=""
                onChange={(userId) => {
                  if (!userId) return;
                  const option = userSelectOptions.find((entry) => entry.value === userId);
                  assign({ userId, name: option?.label ?? userId });
                }}
                options={addOptions}
                emptyLabel="Add someone…"
                contentClassName="w-80 max-w-[calc(100vw-2rem)]"
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ShiftRow<S extends ShiftDraftForAssign>({
  shift,
  block,
  window,
  userSelectOptions,
  responderById,
  conflicts,
  askAvailability,
  readOnly,
  openSlotNote,
  onChange,
  onRemove,
}: {
  shift: S;
  /** Unlinked shifts have no block: their time is always editable. */
  block?: TimelineBlockDraft;
  window: SectionForAvailability | null;
  userSelectOptions: UserSelectOption[];
  responderById: Map<string, AssignableResponder>;
  conflicts: CrewConflict[];
  askAvailability: boolean;
  readOnly: boolean;
  openSlotNote?: string;
  onChange: (next: S) => void;
  onRemove: () => void;
}) {
  const [editingTime, setEditingTime] = useState(false);
  const showTimePicker = !block || editingTime;
  const userId = shift.userId?.trim();
  // The person's own shift time is what matters (it may be custom), still tied
  // to the section so section-level answers apply.
  const blockId = block?.id;
  const personWindow = useMemo(() => {
    const own = shiftWindow({ startsAt: shift.startsAt, endsAt: shift.endsAt });
    return own ? { ...own, id: blockId } : window;
  }, [shift.startsAt, shift.endsAt, blockId, window]);
  const responder = userId ? responderById.get(userId) : undefined;
  const options = useMemo(
    () =>
      annotateOptionsForWindow({
        options: userSelectOptions,
        window: personWindow,
        responderById,
        conflicts,
        askAvailability,
      }),
    [userSelectOptions, personWindow, responderById, conflicts, askAvailability],
  );

  const warnings: Array<{ tone: "rose" | "amber" | "muted"; text: string }> = [];
  if (userId && personWindow) {
    for (const conflict of conflictsDuring(conflicts, userId, personWindow)) {
      warnings.push({
        tone: "rose",
        text: `Also on ${conflict.eventTitle} (${formatDateTimeRange(conflict.startsAt, conflict.endsAt)})`,
      });
    }
    if (askAvailability) {
      const availability = sectionAvailability(responder, personWindow);
      if (availability.level === "unavailable") {
        warnings.push({ tone: "rose", text: `Not available: ${availability.detail ?? "said no"}` });
      } else if (availability.level === "part") {
        warnings.push({ tone: "amber", text: `Only part of this: ${availability.detail ?? ""}`.trim() });
      } else if (availability.level === "backup") {
        warnings.push({ tone: "amber", text: "Said backup only (if no one else can)" });
      } else if (availability.level === "pending") {
        warnings.push({ tone: "muted", text: "Hasn't answered availability for this event" });
      }
      if (responder?.scheduleChanged) {
        warnings.push({ tone: "amber", text: "Answered before the schedule changed" });
      }
    }
  }
  const notes = userId
    ? getAvailabilityNotesForDisplay(responder, { scheduleBlockId: shift.scheduleBlockId })
    : [];

  return (
    <div className="space-y-1" data-testid="crew-shift-row">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-24">
          <Input
            placeholder="Role"
            aria-label="Role"
            value={shift.role}
            disabled={readOnly}
            onChange={(e) => onChange({ ...shift, role: e.target.value })}
          />
        </div>
        <div className="min-w-0 flex-1 basis-40">
          <UserSelect
            value={shift.userId ?? ""}
            onChange={(value) =>
              onChange({
                ...shift,
                userId: value || undefined,
                personName: value
                  ? (userSelectOptions.find((option) => option.value === value)?.label ?? shift.personName)
                  : "",
              })
            }
            options={options}
            emptyLabel="Open slot — pick crew"
            clearable
          />
        </div>
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
            disabled={readOnly}
            onClick={() => setEditingTime((prev) => !prev)}
          >
            <ClockIcon weight={shift.timesOverridden ? "fill" : "regular"} />
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
                  onChange({ ...shift, startsAt: block.startsAt, endsAt: block.endsAt, timesOverridden: false });
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
            {inputRangeLabel(shift.startsAt, shift.endsAt)}
          </span>
        ) : null}
        {!readOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label="Remove shift"
            onClick={onRemove}
          >
            <TrashIcon />
          </Button>
        ) : null}
      </div>
      {!userId && openSlotNote ? <p className="text-xs text-muted-foreground">{openSlotNote}</p> : null}
      {warnings.map((warning, index) => (
        <p
          key={index}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            warning.tone === "rose"
              ? "text-status-rose-700 dark:text-status-rose-200"
              : warning.tone === "amber"
                ? "text-status-amber-800 dark:text-status-amber-300"
                : "text-muted-foreground",
          )}
        >
          {warning.tone === "muted" ? null : (
            <WarningIcon className="size-3.5 shrink-0" weight="fill" aria-hidden />
          )}
          {warning.text}
        </p>
      ))}
      {notes.length > 0 ? (
        <div className="border border-dashed bg-muted/30 px-2 py-1.5">
          <p className="text-2xs font-medium text-muted-foreground">Availability note</p>
          {notes.map((line, noteIndex) => (
            <p key={noteIndex} className="text-xs whitespace-pre-wrap text-muted-foreground italic">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
