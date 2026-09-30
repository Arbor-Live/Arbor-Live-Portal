"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { CrewStaffingBoard } from "@/components/events/crew-staffing/crew-staffing-board";
import { countStaffing, isTraineeShift } from "@/lib/crew-shift-kinds";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { RunOfShowEditor } from "@/components/events/workspace/run-of-show/run-of-show-editor";
import { useRunOfShowData } from "@/components/events/workspace/run-of-show/use-run-of-show-data";
import { isSectionBlockType } from "@/lib/schedule-block-types";
import type { UserSelectOption } from "@/components/users/user-select";
import { assignableCrewSelectOptions } from "@/lib/user-select-description";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import {
  applyShiftTimesOverrideFlags,
  attachShiftsToPersistedBlocks,
  blockDraftFromRow,
  rebaseActBlocks,
  buildQuickAddScheduleBlocks,
  eventTypeHasCrewAssignment,
  getBlockRef,
  reconcileShiftsForReplacedBlocks,
  resolveShiftScheduleBlockId,
  shiftBelongsToBlock,
  sortScheduleBlocksByTime,
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
import { formatUsd } from "@/lib/format";
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
    crewApplicationId?: Id<"crewApplications">;
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
    crewApplicationId: row.crewApplicationId ?? undefined,
    personName: row.personName ?? "",
    startsAt: toLocalDateTimeInput(row.startsAt),
    endsAt: toLocalDateTimeInput(row.endsAt),
    estimatedHourlyRateUsd: row.estimatedHourlyRateUsd,
    postedToExpense: row.postedToExpense,
    notes: row.notes ?? "",
    timesOverridden: row.timesOverridden === true,
  }));
}

const EMBEDDED_CARD =
  "gap-3 bg-transparent py-0 ring-0 *:data-[slot=card-content]:px-0 *:data-[slot=card-header]:px-0";

export function InvoiceLinkedEventCrewSection({
  eventId,
  defaultCrewHourlyRateUsd,
  onEventCrewRowsChange,
  onMessage,
  embedded = false,
}: {
  eventId: Id<"events">;
  defaultCrewHourlyRateUsd: number;
  onEventCrewRowsChange: (rows: InvoiceCrewRow[]) => void;
  onMessage?: (message: string) => void;
  /** Drop the card chrome when nested inside another section (the invoice Crew group). */
  embedded?: boolean;
}) {
  const cardClassName = embedded ? EMBEDDED_CARD : undefined;
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
  // State (not a ref) so effects in the hydrating render still see the old id.
  const [scheduleEventId, setScheduleEventId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<TimelineBlockDraft[]>([]);
  const [shifts, setShifts] = useState<EventShiftDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);

  const eventType = normalizeEventType(eventData?.event.eventType as StoredEventType | undefined);
  const rentalFulfillmentMode = normalizeFulfillmentMode(
    eventData?.event.rentalFulfillmentMode as RentalFulfillmentMode | "pickup" | undefined,
  );
  const startAt = eventData?.event.startAt ? toLocalDateTimeInput(eventData.event.startAt) : "";
  const endAt = eventData?.event.endAt ? toLocalDateTimeInput(eventData.event.endAt) : "";
  const showCrewTools = eventTypeHasCrewAssignment(eventType);

  const viewerUserId = viewer?.userId;
  const userSelectOptions: UserSelectOption[] = useMemo(
    () =>
      assignableCrewSelectOptions(
        managerList,
        viewerUserId
          ? {
              id: viewerUserId,
              name: account?.name ?? account?.email ?? "Current user",
              email: account?.email,
              avatarUrl: account?.avatarUrl,
              image: account?.image,
            }
          : null,
      ),
    [account, managerList, viewerUserId],
  );

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

  const runOfShow = useRunOfShowData(eventId);
  // Crew work sections; a shift on a doors/soundcheck/set block counts as unlinked.
  const sectionBlocks = useMemo(
    () => blocks.filter((block) => isSectionBlockType(block.blockType)),
    [blocks],
  );
  function stableBlocks(nextBlocks: TimelineBlockDraft[]) {
    return withStableBlockRefs(nextBlocks, localBlockCounterRef);
  }

  useEffect(() => {
    if (!eventData?.event) return;
    if (hydratedEventIdRef.current === eventData.event._id) return;
    hydratedEventIdRef.current = eventData.event._id;
    scheduleHydratedRef.current = false;
    const nextBlocks = eventData.blocks.map((row) => blockDraftFromRow(row));
    const nextShifts = shiftsFromEventRows(eventData.shifts);
    const linkedShifts = applyShiftTimesOverrideFlags(
      attachShiftsToPersistedBlocks(nextShifts, nextBlocks),
      nextBlocks,
    );
    setBlocks(nextBlocks);
    setShifts(linkedShifts);
    scheduleHydratedRef.current = true;
    setLastSavedSignature(JSON.stringify({ blocks: nextBlocks, shifts: linkedShifts }));
    setScheduleEventId(eventData.event._id);
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

  useEffect(() => {
    // Only rebase a draft hydrated for this event: in the render that hydrates,
    // `blocks` still holds the previous (or empty) draft.
    if (!eventData?.event || scheduleEventId !== eventData.event._id || saving) return;
    // Lineup edits move an act's soundcheck/set blocks on the server; mirror
    // them here and in the saved signature so they never trigger an autosave.
    const serverActBlocks = eventData.blocks
      .filter((row) => row.participationId || row.needId)
      .map((row) => blockDraftFromRow(row));
    const next = rebaseActBlocks({ blocks, shifts }, serverActBlocks);
    if (!next) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the Convex subscription; converges once the draft matches
    setBlocks(next.blocks);
    setShifts(next.shifts);
    setLastSavedSignature((prev) => {
      if (!prev) return prev;
      const rebased = rebaseActBlocks(
        JSON.parse(prev) as { blocks: TimelineBlockDraft[]; shifts: EventShiftDraft[] },
        serverActBlocks,
      );
      return rebased ? JSON.stringify(rebased) : prev;
    });
  }, [eventData, scheduleEventId, saving, blocks, shifts]);

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
            crewApplicationId: row.crewApplicationId,
            personName: row.personName || undefined,
            startsAt: requireLocalDateTimeInputMs(row.startsAt, "block start"),
            endsAt: requireLocalDateTimeInputMs(row.endsAt, "block end"),
            timesOverridden: row.timesOverridden === true ? true : undefined,
            estimatedHourlyRateUsd:
              row.userId?.trim() || isTraineeShift(row)
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
  const quickAddLabel =
    eventType === "Dry Hire"
      ? rentalFulfillmentMode === "will_call"
        ? "Quick Add: Check-out + Return"
        : "Quick Add: Drop-off + Pickup"
      : eventType === "Rental with Crew"
        ? "Quick Add: Setup + Strike"
        : "Quick Add: Setup + Show + Strike";

  async function saveScheduleAndPersonnel() {
    await persistScheduleDraft(blocks, shifts);
  }

  async function removeLegacyUnassignedShifts() {
    const shouldDelete = await confirm({
      title: "Delete unlinked shifts?",
      description:
        "Deletes crew shifts that aren't on any section of the run of show. Trainees stay.",
      confirmLabel: "Delete shifts",
      destructive: true,
    });
    if (!shouldDelete) return;
    try {
      const result = await deleteUnassignedShifts({ eventId });
      setShifts((prev) =>
        prev.filter(
          (shift) =>
            isTraineeShift(shift) || sectionBlocks.some((block) => shiftBelongsToBlock(shift, block)),
        ),
      );
      onMessage?.(`Deleted ${result.deletedCount} unlinked shift${result.deletedCount === 1 ? "" : "s"}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  if (eventData === undefined) {
    return (
      <Card className={cardClassName}>
        <CardHeader>
          <CardTitle>Crew Schedule</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading linked event schedule...</CardContent>
      </Card>
    );
  }

  if (!eventData) {
    return (
      <Card className={cardClassName}>
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
    <Card className={cardClassName}>
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
        <RunOfShowEditor
          blocks={blocks}
          onChange={(next) => {
            const nextBlocks = stableBlocks(next);
            setBlocks(nextBlocks);
            setShifts((prev) => syncShiftsToBlockTimes(prev, nextBlocks));
          }}
          readOnly={false}
          actsEditable={false}
          eventStartAt={eventData?.event.startAt ?? null}
          acts={runOfShow.acts}
          actName={runOfShow.actName}
          swaps={runOfShow.swaps}
          crewFor={(block) => {
            const staffing = countStaffing(shifts.filter((shift) => shiftBelongsToBlock(shift, block)));
            return { total: staffing.slots, filled: staffing.filled };
          }}
          quickAdd={{
            label: quickAddLabel,
            disabled: quickAddDisabled,
            run: () => {
              if (quickAddDisabled) return;
              const quickAddBlocks = buildQuickAddScheduleBlocks({
                eventType,
                startAt,
                endAt,
                rentalFulfillmentMode,
                withStableRefs: stableBlocks,
              });
              // Quick Add rebuilds sections only; the run of show's moments stay.
              const nextBlocks = sortScheduleBlocksByTime([
                ...quickAddBlocks,
                ...blocks.filter((block) => !isSectionBlockType(block.blockType)),
              ]);
              setBlocks(nextBlocks);
              setShifts((prev) => reconcileShiftsForReplacedBlocks(blocks, nextBlocks, prev));
            },
          }}
        />
        {showCrewTools ? (
          <CrewStaffingBoard
            eventId={eventId}
            sectionBlocks={sectionBlocks}
            shifts={shifts}
            setShifts={setShifts}
            getBlockRef={getBlockRef}
            userSelectOptions={userSelectOptions}
            askAvailability={showCrewTools}
            onDeleteUnlinked={() => void removeLegacyUnassignedShifts()}
            openSlotNote={`Open slot · bills at ${formatUsd(defaultCrewHourlyRateUsd)}/hr on this invoice`}
          />
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
