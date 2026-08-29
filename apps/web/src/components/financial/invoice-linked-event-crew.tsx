"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ClockIcon, PlusIcon, TrashIcon, UserPlusIcon, XIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { EventScheduleCrewAssignPanel } from "@/components/events/event-availability-summary";
import { EventTimelineScheduler, type TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { buildUserSelectDescription } from "@/lib/user-select-description";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import { getAvailabilityNotesForDisplay } from "@/lib/crew-availability";
import {
  applyShiftTimesOverrideFlags,
  attachShiftsToPersistedBlocks,
  buildQuickAddScheduleBlocks,
  eventDayCount,
  eventTypeHasCrewAssignment,
  getBlockRef,
  reconcileShiftsForReplacedBlocks,
  resolveShiftScheduleBlockId,
  shiftBelongsToBlock,
  shiftRowKey,
  shiftTimesMatchBlock,
  syncShiftsToBlockTimes,
  timelineBlocksFromSaved,
  toLocalDateTimeInput,
  withStableBlockRefs,
  type EventShiftDraft,
} from "@/lib/event-schedule-draft";
import { requireLocalDateTimeInputMs } from "@/lib/crew-availability";
import { getEventEditorTabPath } from "@/lib/event-editor-tabs";
import { buildCrewRowsFromShifts, type InvoiceCrewRow } from "@/lib/invoice-crew-from-event";
import { FormSaveBar } from "@/components/forms";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useAppDialog } from "@/components/ui/app-dialog";
import { notify } from "@/lib/notify";
import { formatUsd, formatDateTimeRange } from "@/lib/format";
import { localDateTimeInputToMs } from "@/lib/crew-availability";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/hooks/use-convex-form";

type EventType = "Crewed Event" | "Rental with Crew" | "Dry Hire" | "Services Only";
type StoredEventType = EventType | "Dry Rental";
type RentalFulfillmentMode = "delivery" | "will_call";

function normalizeEventType(value: StoredEventType | undefined): EventType {
  if (value === "Dry Rental") return "Dry Hire";
  return value ?? "Crewed Event";
}

function normalizeFulfillmentMode(
  value: RentalFulfillmentMode | "pickup" | "" | undefined,
): RentalFulfillmentMode {
  if (value === "pickup" || value === "delivery") return "delivery";
  return value === "will_call" ? "will_call" : "delivery";
}

function shiftsFromEventRows(
  rows: Array<{
    _id: Id<"eventCrewShifts">;
    scheduleBlockId?: Id<"eventScheduleBlocks">;
    expenseReportId?: Id<"eventExpenseReports">;
    role: string;
    userId?: string;
    personName?: string;
    startsAt: number;
    endsAt: number;
    estimatedHourlyRateUsd?: number;
    postedToExpense: boolean;
    notes?: string;
    timesOverridden?: boolean;
  }>,
): EventShiftDraft[] {
  return rows.map((row) => ({
    id: row._id,
    scheduleBlockId: row.scheduleBlockId,
    scheduleBlockRef: row.scheduleBlockId,
    expenseReportId: row.expenseReportId,
    role: row.role,
    userId: row.userId ?? undefined,
    personName: row.personName ?? "",
    startsAt: toLocalDateTimeInput(row.startsAt),
    endsAt: toLocalDateTimeInput(row.endsAt),
    estimatedHourlyRateUsd: row.estimatedHourlyRateUsd,
    postedToExpense: row.postedToExpense,
    notes: row.notes ?? "",
    timesOverridden: row.timesOverridden === true,
  }));
}

export function InvoiceLinkedEventCrewSection({
  eventId,
  defaultCrewHourlyRateUsd,
  onEventCrewRowsChange,
  onMessage,
}: {
  eventId: Id<"events">;
  defaultCrewHourlyRateUsd: number;
  onEventCrewRowsChange: (rows: InvoiceCrewRow[]) => void;
  onMessage?: (message: string) => void;
}) {
  const { confirm } = useAppDialog();
  const shell = useSessionShell();
  const viewer = useSessionViewer();
  const account = shell?.account;
  const eventData = useQuery(api.events.get, { id: eventId });
  const managerList = useQuery(api.invoices.listManagers, {});
  const upsertBlocks = useMutation(api.eventSchedule.upsertBlocks);
  const upsertShifts = useMutation(api.eventCrew.upsertShifts);
  const deleteUnassignedShifts = useMutation(api.eventCrew.deleteUnassignedShifts);

  const localBlockCounterRef = useRef(0);
  const hydratedEventIdRef = useRef<Id<"events"> | null>(null);
  const scheduleHydratedRef = useRef(false);
  const [lastSavedSignature, setLastSavedSignature] = useState("");
  const [blocks, setBlocks] = useState<TimelineBlockDraft[]>([]);
  const [shifts, setShifts] = useState<EventShiftDraft[]>([]);
  const [selectedCrewUserId, setSelectedCrewUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [editingShiftTimeKey, setEditingShiftTimeKey] = useState<string | null>(null);

  const eventType = normalizeEventType(eventData?.event.eventType as StoredEventType | undefined);
  const rentalFulfillmentMode = normalizeFulfillmentMode(
    eventData?.event.rentalFulfillmentMode as RentalFulfillmentMode | "pickup" | undefined,
  );
  const startAt = eventData?.event.startAt ? toLocalDateTimeInput(eventData.event.startAt) : "";
  const endAt = eventData?.event.endAt ? toLocalDateTimeInput(eventData.event.endAt) : "";
  const dayCount = eventDayCount(startAt, endAt);
  const showCrewTools = eventTypeHasCrewAssignment(eventType);

  const userOptions = useMemo(() => {
    const base = (managerList ?? []).map((entry) => ({
      value: entry.id,
      label: entry.name,
      description: buildUserSelectDescription({
        ...entry,
        rateMode: entry.rateMode,
        hourlyRateUsd: entry.hourlyRateUsd,
      }),
      avatarUrl: entry.image,
      keywords: `${entry.role ?? ""} ${entry.email ?? ""} ${entry.rateMode ?? ""}`,
      rateMode: entry.rateMode as "normal" | "lead" | "custom" | undefined,
      hourlyRateUsd: entry.hourlyRateUsd,
    }));
    const currentUserId = viewer?.userId;
    if (currentUserId && !base.some((entry) => entry.value === currentUserId)) {
      base.unshift({
        value: currentUserId,
        label: account?.name ?? account?.email ?? "Current user",
        description: account?.email ?? "",
        avatarUrl: account?.avatarUrl ?? account?.image ?? undefined,
        keywords: account?.email ?? "",
        rateMode: undefined,
        hourlyRateUsd: undefined,
      });
    }
    return base.sort((a, b) => a.label.localeCompare(b.label));
  }, [account, managerList, viewer?.userId]);

  const ratesByUserId = useMemo(() => {
    const map = new Map<string, { hourlyRateUsd: number; rateMode: "normal" | "lead" | "custom" }>();
    for (const entry of managerList ?? []) {
      if (!entry.id) continue;
      if (entry.hourlyRateUsd === undefined || entry.hourlyRateUsd <= 0) continue;
      const rateMode =
        entry.rateMode === "lead" || entry.rateMode === "normal" || entry.rateMode === "custom"
          ? entry.rateMode
          : "custom";
      map.set(entry.id, { hourlyRateUsd: entry.hourlyRateUsd, rateMode });
    }
    return map;
  }, [managerList]);

  const userSelectOptions: UserSelectOption[] = useMemo(
    () =>
      userOptions.map((option) => ({
        ...option,
        role: option.description,
        email: option.description,
      })),
    [userOptions],
  );

  const availabilitySummary = useQuery(
    api.eventCrewAvailability.getSummaryForEvent,
    showCrewTools ? { eventId } : "skip",
  );

  const availabilityByUserId = useMemo(() => {
    const map = new Map<string, NonNullable<typeof availabilitySummary>["assignableResponders"][number]>();
    for (const responder of availabilitySummary?.assignableResponders ?? []) {
      map.set(responder.userId, responder);
    }
    return map;
  }, [availabilitySummary]);

  const orphanedShifts = useMemo(
    () => shifts.filter((shift) => !blocks.some((block) => shiftBelongsToBlock(shift, block))),
    [blocks, shifts],
  );

  function stableBlocks(nextBlocks: TimelineBlockDraft[]) {
    return withStableBlockRefs(nextBlocks, localBlockCounterRef);
  }

  useEffect(() => {
    if (!eventData?.event) return;
    if (hydratedEventIdRef.current === eventData.event._id) return;
    hydratedEventIdRef.current = eventData.event._id;
    scheduleHydratedRef.current = false;
    const nextBlocks = eventData.blocks.map((row) => ({
      id: row._id,
      clientId: row._id,
      blockType: row.blockType,
      label: row.label,
      dayIndex: row.dayIndex,
      startsAt: toLocalDateTimeInput(row.startsAt),
      endsAt: toLocalDateTimeInput(row.endsAt),
      notes: row.notes ?? "",
    }));
    const nextShifts = shiftsFromEventRows(eventData.shifts);
    const linkedShifts = applyShiftTimesOverrideFlags(
      attachShiftsToPersistedBlocks(nextShifts, nextBlocks),
      nextBlocks,
    );
    setBlocks(nextBlocks);
    setShifts(linkedShifts);
    scheduleHydratedRef.current = true;
    setLastSavedSignature(JSON.stringify({ blocks: nextBlocks, shifts: linkedShifts }));
  }, [eventData]);

  useEffect(() => {
    if (!scheduleHydratedRef.current) return;
    onEventCrewRowsChange(
      buildCrewRowsFromShifts(blocks, shifts, {
        ratesByUserId,
        openSlotRateUsd: defaultCrewHourlyRateUsd,
      }),
    );
  }, [blocks, shifts, onEventCrewRowsChange, ratesByUserId, defaultCrewHourlyRateUsd]);

  const persistScheduleDraft = useCallback(
    async (draftBlocks: TimelineBlockDraft[], draftShifts: EventShiftDraft[]) => {
      setSaving(true);
      setAutoSaveState("saving");
      setAutoSaveError(null);

      try {
        const blocksWithRefs = withStableBlockRefs(draftBlocks, localBlockCounterRef);
        const savedBlocks = await upsertBlocks({
          eventId,
          blocks: blocksWithRefs.map((row) => ({
            id: row.id as Id<"eventScheduleBlocks"> | undefined,
            clientId: row.clientId,
            blockType: row.blockType,
            label: row.label,
            dayIndex: row.dayIndex,
            startsAt: requireLocalDateTimeInputMs(row.startsAt, "block start"),
            endsAt: requireLocalDateTimeInputMs(row.endsAt, "block end"),
            notes: row.notes || undefined,
          })),
        });
        const nextBlocks = timelineBlocksFromSaved(savedBlocks);
        const linkedShifts = attachShiftsToPersistedBlocks(draftShifts, nextBlocks);

        await upsertShifts({
          eventId,
          shifts: linkedShifts.map((row) => ({
            id: row.id,
            expenseReportId: row.expenseReportId,
            scheduleBlockId: resolveShiftScheduleBlockId(row, nextBlocks),
            role: row.role,
            userId: row.userId || undefined,
            personName: row.personName || undefined,
            startsAt: requireLocalDateTimeInputMs(row.startsAt, "block start"),
            endsAt: requireLocalDateTimeInputMs(row.endsAt, "block end"),
            timesOverridden: row.timesOverridden === true ? true : undefined,
            estimatedHourlyRateUsd: row.userId?.trim()
              ? row.estimatedHourlyRateUsd
              : (row.estimatedHourlyRateUsd ?? defaultCrewHourlyRateUsd),
            postedToExpense: row.expenseReportId ? row.postedToExpense : false,
            notes: row.notes || undefined,
          })),
        });

        setBlocks(nextBlocks);
        setShifts(linkedShifts);
        setLastSavedSignature(JSON.stringify({ blocks: nextBlocks, shifts: linkedShifts }));
        hydratedEventIdRef.current = null;

        onMessage?.("Event schedule and crew slots saved.");
        setAutoSaveState("saved");
        setAutoSaveError(null);
        return true;
      } catch (error) {
        const message = getConvexErrorMessage(error);
        notify.error(message);
        setAutoSaveState("error");
        setAutoSaveError(message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [defaultCrewHourlyRateUsd, eventId, onMessage, upsertBlocks, upsertShifts],
  );

  const scheduleSignature = useMemo(
    () => JSON.stringify({ blocks, shifts }),
    [blocks, shifts],
  );

  const scheduleDirty = lastSavedSignature !== "" && scheduleSignature !== lastSavedSignature;

  const quickAddDisabled = !startAt || !endAt;
  const quickAddDisabledReason = quickAddDisabled ? "Event start and end are required." : undefined;
  const quickAddLabel =
    eventType === "Dry Hire"
      ? rentalFulfillmentMode === "will_call"
        ? "Quick Add: Check-out + Return"
        : "Quick Add: Drop-off + Pickup"
      : eventType === "Rental with Crew"
        ? "Quick Add: Setup + Strike"
        : "Quick Add: Setup + Show + Strike";

  function addPersonnelShift(block: TimelineBlockDraft, options?: { userId?: string }) {
    const blockRef = getBlockRef(block);
    const selectedUser = options?.userId ? userOptions.find((option) => option.value === options.userId) : undefined;
    setShifts((prev) => [
      ...prev,
      {
        scheduleBlockId: block.id as Id<"eventScheduleBlocks"> | undefined,
        scheduleBlockRef: blockRef,
        role: selectedUser?.label ?? "",
        userId: selectedUser?.value,
        personName: selectedUser?.label ?? "",
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        estimatedHourlyRateUsd: selectedUser ? undefined : defaultCrewHourlyRateUsd,
        postedToExpense: false,
        notes: "",
      },
    ]);
  }

  async function saveScheduleAndPersonnel() {
    await persistScheduleDraft(blocks, shifts);
  }

  async function removeLegacyUnassignedShifts() {
    const shouldDelete = await confirm({
      title: "Delete unlinked crew shifts?",
      description: "Delete crew shifts that are not linked to any schedule block on this event?",
      destructive: true,
    });
    if (!shouldDelete) return;
    try {
      const result = await deleteUnassignedShifts({ eventId });
      setShifts((prev) => prev.filter((shift) => shift.scheduleBlockId || shift.scheduleBlockRef));
      onMessage?.(`Deleted ${result.deletedCount} unlinked shift${result.deletedCount === 1 ? "" : "s"}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  function renderShiftRow(
    row: EventShiftDraft,
    shiftIndex: number,
    block: TimelineBlockDraft | undefined,
    blockRef: string | undefined,
    blockIndex: number,
    rowIndex: number,
  ) {
    const availabilityNotes = row.userId
      ? getAvailabilityNotesForDisplay(availabilityByUserId.get(row.userId), {
          scheduleBlockId: row.scheduleBlockId,
        })
      : [];
    const blockLinked = Boolean(block);
    const rowKey = shiftRowKey(row, blockRef, rowIndex);
    const editingTime = editingShiftTimeKey === rowKey;

    return (
      <div key={rowKey} className="space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-[6rem]">
            <Input
              placeholder="Role"
              value={row.role}
              onChange={(e) =>
                setShifts((prev) =>
                  prev.map((shift, i) => (i === shiftIndex ? { ...shift, role: e.target.value } : shift)),
                )
              }
            />
          </div>
          <div className="min-w-0 flex-1 basis-[10rem]">
            <UserSelect
              value={row.userId ?? ""}
              onChange={(value) =>
                setShifts((prev) =>
                  prev.map((shift, i) =>
                    i === shiftIndex
                      ? {
                          ...shift,
                          userId: value || undefined,
                          personName: userOptions.find((option) => option.value === value)?.label ?? shift.personName,
                          estimatedHourlyRateUsd: value ? shift.estimatedHourlyRateUsd : defaultCrewHourlyRateUsd,
                        }
                      : shift,
                  ),
                )
              }
              options={userSelectOptions}
              emptyLabel="Open slot"
            />
          </div>
          {blockLinked ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                className={cn(
                  "shrink-0",
                  row.timesOverridden &&
                    "border-amber-500/50 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 hover:text-amber-900",
                )}
                aria-label={row.timesOverridden ? "Edit custom shift time" : "Edit shift time"}
                title={row.timesOverridden ? "Custom shift time" : "Edit shift time"}
                onClick={() => setEditingShiftTimeKey((prev) => (prev === rowKey ? null : rowKey))}
              >
                <ClockIcon className="size-4" weight={row.timesOverridden ? "fill" : "regular"} />
              </Button>
              {editingTime ? (
                <div className="min-w-0 flex-1 basis-[12rem]">
                  <DateTimeRangePicker
                    startValue={row.startsAt}
                    endValue={row.endsAt}
                    onChange={({ start, end }) =>
                      setShifts((prev) =>
                        prev.map((shift, i) => {
                          if (i !== shiftIndex) return shift;
                          if (!start || !end) {
                            return block
                              ? {
                                  ...shift,
                                  startsAt: block.startsAt,
                                  endsAt: block.endsAt,
                                  timesOverridden: false,
                                }
                              : shift;
                          }
                          const timesOverridden = block
                            ? !shiftTimesMatchBlock({ startsAt: start, endsAt: end }, block)
                            : true;
                          return { ...shift, startsAt: start, endsAt: end, timesOverridden };
                        }),
                      )
                    }
                    placeholder="Shift start and end"
                  />
                </div>
              ) : row.timesOverridden ? (
                <span className="shrink-0 self-center text-xs text-amber-800 tabular-nums">
                  {formatDateTimeRange(
                    localDateTimeInputToMs(row.startsAt) ?? 0,
                    localDateTimeInputToMs(row.endsAt) ?? 0,
                  )}
                </span>
              ) : null}
            </>
          ) : (
            <div className="min-w-0 flex-1 basis-[12rem]">
              <DateTimeRangePicker
                startValue={row.startsAt}
                endValue={row.endsAt}
                onChange={({ start, end }) =>
                  setShifts((prev) =>
                    prev.map((shift, i) =>
                      i === shiftIndex ? { ...shift, startsAt: start, endsAt: end } : shift,
                    ),
                  )
                }
                placeholder="Shift start and end"
              />
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            className="shrink-0"
            aria-label="Remove shift"
            onClick={() => {
              setEditingShiftTimeKey((prev) => (prev === rowKey ? null : prev));
              setShifts((prev) => prev.filter((_, i) => i !== shiftIndex));
            }}
          >
            <TrashIcon className="size-4" />
          </Button>
        </div>
        {!row.userId?.trim() ? (
          <p className="text-xs text-muted-foreground">
            Open slot · bills at {formatUsd(defaultCrewHourlyRateUsd)}/hr on this invoice
          </p>
        ) : null}
        {availabilityNotes.length > 0 ? (
          <div className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Availability note</p>
            {availabilityNotes.map((line, noteIndex) => (
              <p key={noteIndex} className="text-xs text-muted-foreground italic whitespace-pre-wrap">
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (eventData === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Crew Schedule</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading linked event schedule...</CardContent>
      </Card>
    );
  }

  if (!eventData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Crew Schedule</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Linked event not found.</CardContent>
      </Card>
    );
  }

  const barSaveStatus: SaveStatus =
    saving ? "saving" : autoSaveState === "idle" ? "idle" : autoSaveState;

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Crew Schedule</CardTitle>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={getEventEditorTabPath(eventId, "schedule")}>Open in event editor</Link>
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="invoice-linked-crew-blurb">
          Edit schedule blocks and crew slots for{" "}
          <span className="font-medium">{eventData.event.title}</span>. Click Save to persist schedule and crew
          changes to the linked event. Open slots bill at the invoice&apos;s default crew rate (
          {formatUsd(defaultCrewHourlyRateUsd)}/hr).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {showCrewTools ? (
          <EventScheduleCrewAssignPanel
            eventId={eventId}
            blocks={blocks}
            shifts={shifts}
            onShiftsChange={setShifts}
            getBlockRef={getBlockRef}
          />
        ) : null}
        <EventTimelineScheduler
          dayCount={dayCount}
          blocks={blocks}
          anchorStartsAt={startAt}
          onChange={(next) => {
            const nextBlocks = stableBlocks(next);
            setBlocks(nextBlocks);
            setShifts((prev) => syncShiftsToBlockTimes(prev, nextBlocks));
          }}
          quickAddLabel={quickAddLabel}
          quickAddDisabled={quickAddDisabled}
          quickAddDisabledReason={quickAddDisabledReason}
          onQuickAdd={() => {
            if (quickAddDisabled) return;
            const nextBlocks = buildQuickAddScheduleBlocks({
              eventType,
              startAt,
              endAt,
              rentalFulfillmentMode,
              withStableRefs: stableBlocks,
            });
            setBlocks(nextBlocks);
            setShifts((prev) => reconcileShiftsForReplacedBlocks(blocks, nextBlocks, prev));
          }}
        />
        {showCrewTools ? (
          <>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Quick assign</p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 basis-[12rem]">
                  <UserSelect
                    value={selectedCrewUserId}
                    onChange={(value) => setSelectedCrewUserId(value)}
                    options={userSelectOptions}
                    emptyLabel="Select crew user"
                  />
                </div>
                {selectedCrewUserId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label="Clear selected user"
                    onClick={() => setSelectedCrewUserId("")}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Assigned personnel by block</p>
              {blocks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add schedule blocks above, then assign crew shifts to each block.
                </p>
              ) : null}
              {blocks.map((block, blockIndex) => {
                const blockRef = getBlockRef(block);
                const blockShifts = shifts.filter((shift) => shiftBelongsToBlock(shift, block));
                return (
                  <div key={blockRef ?? `block-assignment-${blockIndex}`} className="space-y-2 rounded-md border p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">
                        {block.label || `Block ${blockIndex + 1}`} ({block.blockType})
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="default"
                          size="icon-lg"
                          disabled={!selectedCrewUserId}
                          aria-label="Add shift for selected user"
                          title="Add shift for selected user"
                          onClick={() => addPersonnelShift(block, { userId: selectedCrewUserId })}
                        >
                          <UserPlusIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          aria-label="Add empty shift"
                          title="Add empty shift"
                          onClick={() => addPersonnelShift(block)}
                        >
                          <PlusIcon className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    {blockShifts.length ? (
                      blockShifts.map((row, rowIndex) => {
                        const shiftIndex = shifts.findIndex((entry) => entry === row);
                        return renderShiftRow(row, shiftIndex, block, blockRef, blockIndex, rowIndex);
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">No personnel assigned to this block yet.</p>
                    )}
                  </div>
                );
              })}
              {orphanedShifts.length > 0 ? (
                <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-amber-800">Unlinked crew shifts</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => void removeLegacyUnassignedShifts()}>
                      Delete Unlinked Shifts
                    </Button>
                  </div>
                  <p className="text-xs text-amber-700">
                    These shifts are saved on the event but not attached to a current schedule block. Re-add them to a
                    block or delete them.
                  </p>
                  {orphanedShifts.map((row, rowIndex) => {
                    const shiftIndex = shifts.findIndex((entry) => entry === row);
                    return renderShiftRow(row, shiftIndex, undefined, undefined, -1, rowIndex);
                  })}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        <Button type="button" disabled={saving} onClick={() => void saveScheduleAndPersonnel()}>
          {saving ? "Saving..." : "Save Schedule & Crew"}
        </Button>
      </CardContent>
    </Card>

    <FormSaveBar
      tier="C"
      saveStatus={barSaveStatus}
      saveError={autoSaveError}
      isDirty={scheduleDirty}
      isSubmitting={saving}
      saveLabel="Save schedule"
      onSave={() => void saveScheduleAndPersonnel()}
      onRetry={() => void saveScheduleAndPersonnel()}
    />
    </>
  );
}
