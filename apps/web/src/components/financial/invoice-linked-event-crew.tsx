"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { EventScheduleCrewAssignPanel } from "@/components/events/event-availability-summary";
import { EventTimelineScheduler, type TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { getAvailabilityNotesForDisplay } from "@/lib/crew-availability";
import {
  buildQuickAddScheduleBlocks,
  eventDayCount,
  getBlockRef,
  mapPersistedBlockIdByRef,
  shiftHours,
  toLocalDateTimeInput,
  withStableBlockRefs,
  type EventShiftDraft,
} from "@/lib/event-schedule-draft";
import { getEventEditorTabPath } from "@/lib/event-editor-tabs";
import { buildCrewRowsFromShifts, type InvoiceCrewRow } from "@/lib/invoice-crew-from-event";

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong while saving. Please try again.";
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
  const session = authClient.useSession();
  const eventData = useQuery(api.events.get, { id: eventId });
  const managerList = useQuery(api.invoices.listManagers, {});
  const upsertBlocks = useMutation(api.eventSchedule.upsertBlocks);
  const upsertShifts = useMutation(api.eventCrew.upsertShifts);
  const deleteUnassignedShifts = useMutation(api.eventCrew.deleteUnassignedShifts);

  const localBlockCounterRef = useRef(0);
  const hydratedEventIdRef = useRef<Id<"events"> | null>(null);
  const scheduleHydratedRef = useRef(false);
  const [blocks, setBlocks] = useState<TimelineBlockDraft[]>([]);
  const [shifts, setShifts] = useState<EventShiftDraft[]>([]);
  const [selectedCrewUserId, setSelectedCrewUserId] = useState("");
  const [saving, setSaving] = useState(false);

  const eventType = normalizeEventType(eventData?.event.eventType as StoredEventType | undefined);
  const rentalFulfillmentMode = normalizeFulfillmentMode(
    eventData?.event.rentalFulfillmentMode as RentalFulfillmentMode | "pickup" | undefined,
  );
  const startAt = eventData?.event.startAt ? toLocalDateTimeInput(eventData.event.startAt) : "";
  const endAt = eventData?.event.endAt ? toLocalDateTimeInput(eventData.event.endAt) : "";
  const dayCount = eventDayCount(startAt, endAt);
  const showCrewTools = eventType === "Crewed Event" || eventType === "Rental with Crew";

  const userOptions = useMemo(() => {
    const base = (managerList ?? []).map((entry) => ({
      value: entry.id,
      label: entry.name,
      description: [entry.role, entry.email].filter(Boolean).join(" • "),
      avatarUrl: entry.image,
      keywords: `${entry.role ?? ""} ${entry.email ?? ""}`,
    }));
    const currentUserId = session.data?.user?.id;
    if (currentUserId && !base.some((entry) => entry.value === currentUserId)) {
      base.unshift({
        value: currentUserId,
        label: session.data?.user?.name ?? session.data?.user?.email ?? "Current user",
        description: session.data?.user?.email ?? "",
        avatarUrl: session.data?.user?.image ?? undefined,
        keywords: session.data?.user?.email ?? "",
      });
    }
    return base.sort((a, b) => a.label.localeCompare(b.label));
  }, [managerList, session.data?.user]);

  const userSelectOptions: UserSelectOption[] = useMemo(
    () =>
      userOptions.map((option) => ({
        ...option,
        role: option.description,
        email: option.description,
      })),
    [userOptions],
  );

  const selectedCrewUserOption = useMemo(
    () => userOptions.find((option) => option.value === selectedCrewUserId),
    [selectedCrewUserId, userOptions],
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

  function stableBlocks(nextBlocks: TimelineBlockDraft[]) {
    return withStableBlockRefs(nextBlocks, localBlockCounterRef);
  }

  useEffect(() => {
    if (!eventData?.event) return;
    if (hydratedEventIdRef.current === eventData.event._id) return;
    hydratedEventIdRef.current = eventData.event._id;
    scheduleHydratedRef.current = false;
    setBlocks(
      eventData.blocks.map((row) => ({
        id: row._id,
        clientId: row._id,
        blockType: row.blockType,
        label: row.label,
        dayIndex: row.dayIndex,
        startsAt: toLocalDateTimeInput(row.startsAt),
        endsAt: toLocalDateTimeInput(row.endsAt),
        notes: row.notes ?? "",
      })),
    );
    setShifts(
      eventData.shifts.map((row) => ({
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
      })),
    );
    scheduleHydratedRef.current = true;
  }, [eventData]);

  useEffect(() => {
    if (!scheduleHydratedRef.current) return;
    onEventCrewRowsChange(buildCrewRowsFromShifts(blocks, shifts));
  }, [blocks, shifts, onEventCrewRowsChange]);

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
        role: "",
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

  async function saveSchedule() {
    const blocksWithRefs = stableBlocks(blocks);
    const savedBlocks = await upsertBlocks({
      eventId,
      blocks: blocksWithRefs.map((row) => ({
        id: row.id as Id<"eventScheduleBlocks"> | undefined,
        clientId: row.clientId,
        blockType: row.blockType,
        label: row.label,
        dayIndex: row.dayIndex,
        startsAt: new Date(row.startsAt).getTime(),
        endsAt: new Date(row.endsAt).getTime(),
        notes: row.notes || undefined,
      })),
    });
    setBlocks(
      savedBlocks.map((row) => ({
        id: row.id,
        clientId: row.clientId ?? row.id,
        blockType: row.blockType,
        label: row.label,
        dayIndex: row.dayIndex,
        startsAt: toLocalDateTimeInput(row.startsAt),
        endsAt: toLocalDateTimeInput(row.endsAt),
        notes: row.notes ?? "",
      })),
    );
    const persistedBlockIdByRef = mapPersistedBlockIdByRef(
      savedBlocks.map((row) => ({
        id: row.id,
        clientId: row.clientId ?? row.id,
        blockType: row.blockType,
        label: row.label,
        dayIndex: row.dayIndex,
        startsAt: toLocalDateTimeInput(row.startsAt),
        endsAt: toLocalDateTimeInput(row.endsAt),
        notes: row.notes ?? "",
      })),
    );
    setShifts((prev) =>
      prev.map((shift) => {
        const persistedId =
          shift.scheduleBlockId ??
          (shift.scheduleBlockRef ? persistedBlockIdByRef.get(shift.scheduleBlockRef) : undefined);
        return {
          ...shift,
          scheduleBlockId: persistedId,
          scheduleBlockRef: shift.scheduleBlockRef ?? persistedId,
        };
      }),
    );
  }

  async function saveShifts() {
    const persistedBlockIdByRef = mapPersistedBlockIdByRef(blocks);
    const validBlockIds = new Set(blocks.map((block) => block.id).filter(Boolean));
    await upsertShifts({
      eventId,
      shifts: shifts.map((row) => ({
        id: row.id,
        expenseReportId: row.expenseReportId,
        scheduleBlockId:
          (row.scheduleBlockId && validBlockIds.has(row.scheduleBlockId)
            ? row.scheduleBlockId
            : row.scheduleBlockRef
              ? persistedBlockIdByRef.get(row.scheduleBlockRef)
              : undefined) ?? undefined,
        role: row.role,
        userId: row.userId || undefined,
        personName: row.personName || undefined,
        startsAt: new Date(row.startsAt).getTime(),
        endsAt: new Date(row.endsAt).getTime(),
        estimatedHourlyRateUsd:
          row.userId?.trim()
            ? row.estimatedHourlyRateUsd
            : (row.estimatedHourlyRateUsd ?? defaultCrewHourlyRateUsd),
        postedToExpense: row.expenseReportId ? row.postedToExpense : false,
        notes: row.notes || undefined,
      })),
    });
  }

  async function saveScheduleAndPersonnel() {
    setSaving(true);
    try {
      await saveSchedule();
      await saveShifts();
      onMessage?.("Event schedule and crew slots saved. Invoice crew lines updated.");
    } catch (error) {
      onMessage?.(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeLegacyUnassignedShifts() {
    const shouldDelete = window.confirm(
      "Delete all legacy shifts that are not assigned to any schedule block?",
    );
    if (!shouldDelete) return;
    try {
      const result = await deleteUnassignedShifts({ eventId });
      setShifts((prev) => prev.filter((shift) => shift.scheduleBlockRef));
      onMessage?.(`Deleted ${result.deletedCount} legacy unassigned shift${result.deletedCount === 1 ? "" : "s"}.`);
    } catch (error) {
      onMessage?.(getErrorMessage(error));
    }
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Crew Schedule</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href={getEventEditorTabPath(eventId, "schedule")}>Open in event editor</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Edit schedule blocks and crew slots for{" "}
          <span className="font-medium">{eventData.event.title}</span>. Open slots bill at the invoice&apos;s default
          crew rate (${defaultCrewHourlyRateUsd.toFixed(2)}/hr). Save to update the event and invoice crew lines.
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
          onChange={(next) => setBlocks(stableBlocks(next))}
          quickAddLabel={quickAddLabel}
          quickAddDisabled={quickAddDisabled}
          quickAddDisabledReason={quickAddDisabledReason}
          onQuickAdd={() => {
            if (quickAddDisabled) return;
            setBlocks(
              buildQuickAddScheduleBlocks({
                eventType,
                startAt,
                endAt,
                rentalFulfillmentMode,
                withStableRefs: stableBlocks,
              }),
            );
          }}
        />
        {showCrewTools ? (
          <>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Quick assign crew user</p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[260px] flex-1">
                  <UserSelect
                    value={selectedCrewUserId}
                    onChange={(value) => setSelectedCrewUserId(value)}
                    options={userSelectOptions}
                    emptyLabel="Select crew user"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!selectedCrewUserId}
                  onClick={() => setSelectedCrewUserId("")}
                >
                  Clear Selected User
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedCrewUserOption
                  ? `Selected: ${selectedCrewUserOption.label}. Use Add Shift for Selected User on each block.`
                  : "Select a crew user, then use Add Shift for Selected User on each block."}
              </p>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Assigned personnel by block</p>
              {blocks.map((block, blockIndex) => {
                const blockRef = getBlockRef(block);
                const blockShifts = shifts.filter((shift) => shift.scheduleBlockRef === blockRef);
                return (
                  <div key={blockRef ?? `block-assignment-${blockIndex}`} className="space-y-2 rounded-md border p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {block.label || `Block ${blockIndex + 1}`} ({block.blockType})
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          disabled={!selectedCrewUserId}
                          onClick={() => addPersonnelShift(block, { userId: selectedCrewUserId })}
                        >
                          Add Shift for Selected User
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => addPersonnelShift(block)}>
                          Add Empty Shift
                        </Button>
                      </div>
                    </div>
                    {blockShifts.length ? (
                      blockShifts.map((row, rowIndex) => {
                        const shiftIndex = shifts.findIndex((entry) => entry === row);
                        const availabilityNotes = row.userId
                          ? getAvailabilityNotesForDisplay(availabilityByUserId.get(row.userId), {
                              scheduleBlockId: row.scheduleBlockId,
                            })
                          : [];
                        return (
                          <div key={row.id ?? `${blockRef ?? blockIndex}-shift-${rowIndex}`} className="space-y-1">
                            <div className="grid gap-2 md:grid-cols-6">
                              <Input
                                placeholder="Role"
                                value={row.role}
                                onChange={(e) =>
                                  setShifts((prev) =>
                                    prev.map((shift, i) =>
                                      i === shiftIndex ? { ...shift, role: e.target.value } : shift,
                                    ),
                                  )
                                }
                              />
                              <UserSelect
                                value={row.userId ?? ""}
                                onChange={(value) =>
                                  setShifts((prev) =>
                                    prev.map((shift, i) =>
                                      i === shiftIndex
                                        ? {
                                            ...shift,
                                            userId: value || undefined,
                                            personName:
                                              userOptions.find((option) => option.value === value)?.label ??
                                              shift.personName,
                                            estimatedHourlyRateUsd: value
                                              ? shift.estimatedHourlyRateUsd
                                              : defaultCrewHourlyRateUsd,
                                          }
                                        : shift,
                                    ),
                                  )
                                }
                                options={userSelectOptions}
                                emptyLabel="Open slot"
                              />
                              <DateTimePicker
                                value={row.startsAt}
                                onChange={(value) =>
                                  setShifts((prev) =>
                                    prev.map((shift, i) => (i === shiftIndex ? { ...shift, startsAt: value } : shift)),
                                  )
                                }
                                placeholder="Shift start"
                              />
                              <DateTimePicker
                                value={row.endsAt}
                                onChange={(value) =>
                                  setShifts((prev) =>
                                    prev.map((shift, i) => (i === shiftIndex ? { ...shift, endsAt: value } : shift)),
                                  )
                                }
                                placeholder="Shift end"
                              />
                              <Input
                                readOnly
                                value={`${shiftHours(row).toFixed(2)}h`}
                                aria-label="Shift hours"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShifts((prev) => prev.filter((_, i) => i !== shiftIndex))}
                              >
                                Remove
                              </Button>
                            </div>
                            {!row.userId?.trim() ? (
                              <p className="text-xs text-muted-foreground">
                                Open slot · bills at ${defaultCrewHourlyRateUsd.toFixed(2)}/hr on this invoice
                              </p>
                            ) : null}
                            {availabilityNotes.length > 0 ? (
                              <div className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5">
                                <p className="text-[11px] font-medium text-muted-foreground">Availability note</p>
                                {availabilityNotes.map((line, noteIndex) => (
                                  <p
                                    key={noteIndex}
                                    className="text-xs text-muted-foreground italic whitespace-pre-wrap"
                                  >
                                    {line}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">No personnel assigned to this block yet.</p>
                    )}
                  </div>
                );
              })}
              {shifts.some((shift) => !shift.scheduleBlockRef) ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700">
                  <span>
                    Some legacy shifts are not assigned to a schedule block yet. Assign them by adding personnel on a
                    block.
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => void removeLegacyUnassignedShifts()}>
                    Delete Legacy Unassigned Shifts
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        <Button type="button" disabled={saving} onClick={() => void saveScheduleAndPersonnel()}>
          {saving ? "Saving..." : "Save Schedule & Crew Slots"}
        </Button>
      </CardContent>
    </Card>
  );
}
