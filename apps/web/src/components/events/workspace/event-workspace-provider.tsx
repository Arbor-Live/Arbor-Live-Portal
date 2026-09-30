"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import { useAppDialog } from "@/components/ui/app-dialog";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import type { UserSelectOption } from "@/components/users/user-select";
import { assignableCrewSelectOptions } from "@/lib/user-select-description";
import { normalizeEventStatus } from "@/lib/event-status";
import {
  applyShiftTimesOverrideFlags,
  attachShiftsToPersistedBlocks,
  blockDraftFromRow,
  mergeServerActBlocks,
  resolveShiftScheduleBlockId,
  shiftBelongsToBlock,
  sortScheduleBlocksByTime,
  timelineBlocksFromSaved,
} from "@/lib/event-schedule-draft";
import {
  localDateTimeInputToMs,
  requireLocalDateTimeInputMs,
  toLocalDateTimeInput,
} from "@/lib/crew-availability";
import { pacificScheduleDayCount } from "@/lib/format";
import {
  EVENT_EDITOR_TABS,
  getEventEditorTabPath,
  type EventEditorTabId,
} from "@/lib/event-editor-tabs";
import { eventGroupKind, groupDayNoun, type SeriesEditScope } from "@/lib/event-series";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import type { SaveStatus } from "@/hooks/use-convex-form";
import {
  buildEventUpdatePatch,
  changedDraftKeys,
  dirtySections,
  draftFromEvent,
  EMPTY_EVENT_DRAFT,
  eventTypeHasLogistics,
  type DraftSection,
  type EventDraft,
  type ShiftDraft,
} from "@/components/events/workspace/event-draft";
import { isTraineeShift } from "@/lib/crew-shift-kinds";
import { isSectionBlockType } from "@/lib/schedule-block-types";

type SavedSchedule = { blocks: TimelineBlockDraft[]; shifts: ShiftDraft[] };

function useEventWorkspaceState(eventId: Id<"events">, activeTab: EventEditorTabId) {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const shell = useSessionShell();
  const viewer = useSessionViewer();
  const account = shell?.account;
  const isAdmin = viewer?.isAdmin ?? false;
  const canSeeBilling = isAdmin || (viewer?.verticals.includes("Operations") ?? false);

  const eventData = useQuery(api.events.get, { id: eventId, detail: "full" });
  const siblingDays = useQuery(api.events.listSiblingDays, { eventId });
  // One assignable-user list feeds the header, people pickers, and crew assignment.
  const managerList = useQuery(api.invoices.listManagers, {});

  const updateEvent = useMutation(api.events.update);
  const setEventStatus = useMutation(api.events.setStatus);
  const deleteEventAdmin = useMutation(api.events.deleteEvent);
  const upsertBlocks = useMutation(api.eventSchedule.upsertBlocks);
  const upsertShifts = useMutation(api.eventCrew.upsertShifts);
  const deleteUnassignedShifts = useMutation(api.eventCrew.deleteUnassignedShifts);
  const reattachOccurrence = useMutation(api.eventSeries.reattachOccurrence);
  const applyDaySetupMutation = useMutation(api.eventSeries.applyDaySetup);
  const [applySetupOpen, setApplySetupOpen] = useState(false);

  const [draft, setDraft] = useState<EventDraft>(EMPTY_EVENT_DRAFT);
  const [baseline, setBaseline] = useState<EventDraft | null>(null);
  const [blocks, setBlocks] = useState<TimelineBlockDraft[]>([]);
  const [shifts, setShifts] = useState<ShiftDraft[]>([]);
  const [scheduleBaseline, setScheduleBaseline] = useState("");
  // State (not a ref) so effects in the hydrating render still see the old id.
  const [scheduleEventId, setScheduleEventId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editScopeRequest, setEditScopeRequest] = useState<
    ((scope: SeriesEditScope | null) => void) | null
  >(null);
  const hydratedEventIdRef = useRef<string | null>(null);
  // Bumped to re-hydrate from the server (e.g. after "Reset to series"); a ref
  // alone cannot re-run the effect once the updated query has already arrived.
  const [hydrationToken, setHydrationToken] = useState(0);
  const hydratedTokenRef = useRef(0);
  const localBlockCounterRef = useRef(0);

  const linkedInvoiceIdForLookup = (draft.invoiceId || eventData?.event.invoiceId) as
    | Id<"invoices">
    | undefined;
  // Overview shows the quote-approved status hint; Billing shows the primary host and margin.
  // Loaded on every tab: the global save bar resolves the primary host from it.
  const linkedInvoiceDetail = useQuery(
    api.invoices.get,
    linkedInvoiceIdForLookup ? { id: linkedInvoiceIdForLookup } : "skip",
  );
  const linkedInvoice = linkedInvoiceDetail?.invoice ?? null;

  useEffect(() => {
    if (!eventData?.event) return;
    if (
      hydratedEventIdRef.current === eventData.event._id &&
      hydratedTokenRef.current === hydrationToken
    ) {
      return;
    }
    hydratedEventIdRef.current = eventData.event._id;
    hydratedTokenRef.current = hydrationToken;
    // One-time hydration per loaded event id (guarded by hydratedEventIdRef above) so
    // in-progress edits are never overwritten by a later re-run of this effect.
    const nextDraft = draftFromEvent(eventData.event, {
      additionalInvoiceIds: (eventData.linkedInvoices ?? [])
        .filter((row) => !row.isPrimary)
        .map((row) => row._id),
    });
    setDraft(nextDraft);
    setBaseline(nextDraft);
    const nextBlocks = sortScheduleBlocksByTime(eventData.blocks.map((row) => blockDraftFromRow(row)));
    const nextShifts = applyShiftTimesOverrideFlags(
      eventData.shifts.map((row) => ({
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
        postedToExpense: row.postedToExpense,
        notes: row.notes ?? "",
        timesOverridden: row.timesOverridden === true,
      })),
      nextBlocks,
    );
    setBlocks(nextBlocks);
    setShifts(nextShifts);
    setScheduleBaseline(JSON.stringify({ blocks: nextBlocks, shifts: nextShifts }));
    setScheduleEventId(`${eventData.event._id}:${hydrationToken}`);
    setSaveStatus("idle");
    setSaveError(null);
  }, [eventData, hydrationToken]);

  useEffect(() => {
    if (!eventData?.event || !baseline || hydratedEventIdRef.current !== eventData.event._id) return;
    // Adopt server-side changes (another editor, or status auto-advancing after a quote
    // approval) for fields this user hasn't touched. Edited fields keep the local value.
    const server = draftFromEvent(eventData.event, {
      additionalInvoiceIds: (eventData.linkedInvoices ?? [])
        .filter((row) => !row.isPrimary)
        .map((row) => row._id),
    });
    const edited = new Set(changedDraftKeys(draft, baseline));
    const rebase: Partial<EventDraft> = {};
    for (const key of changedDraftKeys(server, baseline)) {
      if (!edited.has(key)) {
        Object.assign(rebase, { [key]: server[key] });
      }
    }
    if (Object.keys(rebase).length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the Convex subscription; converges once baseline matches the server
    setBaseline((prev) => (prev ? { ...prev, ...rebase } : prev));
    setDraft((prev) => ({ ...prev, ...rebase }));
  }, [eventData, baseline, draft]);

  useEffect(() => {
    // Only rebase a draft hydrated for this event: in the render that hydrates,
    // `blocks` still holds the previous (or empty) draft.
    if (!eventData?.event || scheduleEventId !== `${eventData.event._id}:${hydrationToken}`) return;
    // Act soundcheck/set blocks change on the server too (another editor, or a
    // platform act taking over a lineup position); merge those in without
    // overwriting this user's unsaved Run of Show edits.
    const serverActBlocks = eventData.blocks
      .filter((row) => row.participationId || row.needId)
      .map((row) => blockDraftFromRow(row));
    // Mid-save, this render's draft can predate the saved ids; merging then would
    // duplicate newly created blocks. The effect re-runs once the save settles.
    if (!scheduleBaseline || saveStatus === "saving") return;
    const merged = mergeServerActBlocks(
      { blocks, shifts },
      JSON.parse(scheduleBaseline) as SavedSchedule,
      serverActBlocks,
    );
    if (!merged) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the Convex subscription; converges once the baseline matches
    setBlocks(merged.state.blocks);
    setShifts(merged.state.shifts);
    setScheduleBaseline(JSON.stringify(merged.baseline));
  }, [eventData, scheduleEventId, hydrationToken, scheduleBaseline, saveStatus, blocks, shifts]);

  const updateDraft = useCallback((patch: Partial<EventDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearSavedStatus = useCallback(() => {
    setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
  }, []);

  function makeLocalBlockRef() {
    localBlockCounterRef.current += 1;
    return `local-block-${localBlockCounterRef.current}`;
  }

  function withStableBlockRefs(nextBlocks: TimelineBlockDraft[]) {
    return nextBlocks.map((block) =>
      block.id || block.clientId ? block : { ...block, clientId: makeLocalBlockRef() },
    );
  }

  function getBlockRef(block: TimelineBlockDraft) {
    return block.id ?? block.clientId;
  }

  // A shift is unlinked when it matches no current schedule block — including a
  // stale `scheduleBlockId` left behind when its block was deleted by a backend
  // path that does not relink shifts (e.g. series block regeneration).
  /** Crew belong to sections; a shift on a moment (soundcheck, set, …) counts as unlinked. */
  /** Staffing shifts with no section. Trainees span sections on purpose, so they never count. */
  function isShiftUnlinked(shift: ShiftDraft) {
    if (isTraineeShift(shift)) return false;
    return !blocks.some(
      (block) => isSectionBlockType(block.blockType) && shiftBelongsToBlock(shift, block),
    );
  }

  const changedKeys = useMemo(() => changedDraftKeys(draft, baseline), [draft, baseline]);
  const scheduleDirty = useMemo(
    () => Boolean(scheduleBaseline) && JSON.stringify({ blocks, shifts }) !== scheduleBaseline,
    [blocks, shifts, scheduleBaseline],
  );
  const dirty = useMemo(() => {
    const sections: Set<DraftSection | "schedule"> = dirtySections(changedKeys);
    if (scheduleDirty) sections.add("schedule");
    return sections;
  }, [changedKeys, scheduleDirty]);

  const effectivePrimaryHostGroupId = draft.invoiceId
    ? linkedInvoice?.groupId
      ? String(linkedInvoice.groupId)
      : ""
    : draft.hostGroupId;

  const seriesMeta = eventData?.series ?? null;
  const canEdit = eventData?.canEdit ?? false;
  const readOnly = eventData !== undefined && !canEdit;

  const dayCount = useMemo(() => {
    const startMs = localDateTimeInputToMs(draft.startAt);
    if (startMs == null) return 1;
    // Day rows follow the schedule span from event start through the latest of
    // event end and any block times — so 11pm show end + 1am strike gets Day 2
    // without forcing events.endAt past midnight.
    let latestMs = localDateTimeInputToMs(draft.endAt) ?? startMs;
    for (const block of blocks) {
      const blockStart = localDateTimeInputToMs(block.startsAt);
      const blockEnd = localDateTimeInputToMs(block.endsAt);
      if (blockStart != null) latestMs = Math.max(latestMs, blockStart);
      if (blockEnd != null) latestMs = Math.max(latestMs, blockEnd);
    }
    if (latestMs < startMs) latestMs = startMs;
    return pacificScheduleDayCount(startMs, latestMs);
  }, [draft.startAt, draft.endAt, blocks]);

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

  const visibleTabs = useMemo(
    () =>
      EVENT_EDITOR_TABS.filter((tab) => {
        if ((tab === "schedule" || tab === "equipment") && !eventTypeHasLogistics(draft.eventType)) {
          return false;
        }
        if (tab === "billing" && !canSeeBilling) return false;
        return true;
      }),
    [draft.eventType, canSeeBilling],
  );
  const resolvedActiveTab: EventEditorTabId = visibleTabs.includes(activeTab) ? activeTab : "overview";

  useEffect(() => {
    // Wait for hydration: the default draft type is not the event's real type.
    if (!baseline || visibleTabs.includes(activeTab)) return;
    router.replace(getEventEditorTabPath(eventId, "overview"));
  }, [activeTab, baseline, visibleTabs, eventId, router]);

  function requestEditScope() {
    return new Promise<SeriesEditScope | null>((resolve) => {
      setEditScopeRequest(() => (scope: SeriesEditScope | null) => {
        setEditScopeRequest(null);
        resolve(scope);
      });
    });
  }

  async function saveScheduleAndShifts() {
    const blocksWithRefs = withStableBlockRefs(
      blocks.map((row) => ({ ...row, dayIndex: Math.max(0, row.dayIndex) })),
    );
    const savedBlocks = await upsertBlocks({
      eventId,
      // The Run of Show owns act soundcheck/set blocks.
      editsActBlocks: true,
      blocks: blocksWithRefs.map((row) => ({
        id: row.id as Id<"eventScheduleBlocks"> | undefined,
        clientId: row.clientId,
        blockType: row.blockType,
        label: row.label,
        dayIndex: row.dayIndex,
        startsAt: requireLocalDateTimeInputMs(row.startsAt, "block start"),
        endsAt: requireLocalDateTimeInputMs(row.endsAt, "block end"),
        notes: row.notes || undefined,
        ...(row.id
          ? {}
          : {
              participationId: row.participationId as Id<"eventBandParticipations"> | undefined,
              needId: row.needId as Id<"eventArtistNeeds"> | undefined,
            }),
      })),
    });
    // Blocks first so new blocks have ids before shifts reference them.
    const nextBlocks = timelineBlocksFromSaved(savedBlocks);
    const nextShifts = attachShiftsToPersistedBlocks(shifts, nextBlocks);
    setBlocks(nextBlocks);
    setShifts(nextShifts);
    await upsertShifts({
      eventId,
      shifts: nextShifts.map((row) => ({
        id: row.id,
        expenseReportId: row.expenseReportId,
        scheduleBlockId: resolveShiftScheduleBlockId(row, nextBlocks),
        role: row.role,
        userId: row.userId || undefined,
        crewApplicationId: row.crewApplicationId,
        personName: row.personName || undefined,
        startsAt: requireLocalDateTimeInputMs(row.startsAt, "shift start"),
        endsAt: requireLocalDateTimeInputMs(row.endsAt, "shift end"),
        timesOverridden: row.timesOverridden === true ? true : undefined,
        postedToExpense: row.expenseReportId ? row.postedToExpense : false,
        notes: row.notes || undefined,
      })),
    });
    setScheduleBaseline(JSON.stringify({ blocks: nextBlocks, shifts: nextShifts }));
  }

  function failSave(text: string) {
    setSaveStatus("error");
    setSaveError(text);
    notify.error(text);
  }

  async function saveAll() {
    if (saveStatus === "saving" || readOnly) return;
    const draftSnapshot = draft;
    const keys = changedKeys;
    if (keys.length === 0 && !scheduleDirty) return;
    if (keys.length > 0) {
      if (!draftSnapshot.title.trim()) return failSave("The event needs a title.");
      if (!draftSnapshot.startAt || !draftSnapshot.endAt) {
        return failSave("Set when the event starts and ends.");
      }
    }
    let editScope: SeriesEditScope | undefined;
    if (keys.length > 0 && seriesMeta && !seriesMeta.seriesDetached) {
      const scope = await requestEditScope();
      if (!scope) return;
      editScope = scope;
    }
    setSaveStatus("saving");
    setSaveError(null);
    try {
      if (keys.length > 0) {
        const patch = buildEventUpdatePatch(draftSnapshot, keys, {
          isAdmin,
          effectivePrimaryHostGroupId,
        });
        await updateEvent({ id: eventId, ...patch, editScope });
        setBaseline(draftSnapshot);
      }
    } catch (error) {
      return failSave(`Couldn’t save event details: ${getConvexErrorMessage(error)}`);
    }
    try {
      if (scheduleDirty) await saveScheduleAndShifts();
    } catch (error) {
      return failSave(`Couldn’t save the schedule: ${getConvexErrorMessage(error)}`);
    }
    setSaveStatus("saved");
    notify.success("Event saved.");
  }

  function discardChanges() {
    if (baseline) setDraft(baseline);
    if (scheduleBaseline) {
      const saved = JSON.parse(scheduleBaseline) as SavedSchedule;
      setBlocks(saved.blocks);
      setShifts(saved.shifts);
    }
    setSaveStatus("idle");
    setSaveError(null);
  }

  async function confirmLeaveIfDirty() {
    if (dirty.size === 0) return true;
    return confirm({
      title: "Discard unsaved changes?",
      description: "You have unsaved edits on this event. Switching away will lose them.",
      confirmLabel: "Discard",
      destructive: true,
    });
  }

  async function switchToDay(nextId: Id<"events">) {
    if (nextId === eventId) return;
    if (!(await confirmLeaveIfDirty())) return;
    router.push(getEventEditorTabPath(nextId, resolvedActiveTab));
  }

  /**
   * Apply this day's setup (Run of Show sections, open crew slots, positions,
   * pull list) to the other days of its group, through the group template.
   */
  async function applySetupToOtherDays(args: {
    scope: "all" | "future";
    schedule: boolean;
    positions: boolean;
    pullList: boolean;
  }) {
    try {
      const result = await applyDaySetupMutation({ eventId, ...args });
      const count = result.updatedCount;
      const noun = groupDayNoun(eventGroupKind(seriesMeta), count !== 1);
      notify.success(`Applied this day's setup to ${count} other ${noun}.`);
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
      return false;
    }
  }

  async function resetToSeries() {
    if (readOnly) return;
    const multiDay = eventGroupKind(seriesMeta) === "multi_day";
    const shouldReset = await confirm({
      title: multiDay
        ? "Reset this day to the booking template?"
        : "Reset this occurrence to the series template?",
      description: multiDay
        ? "This restores the shared details, Run of Show sections, open crew slots and open positions from the booking template, and clears the detached state. Times, assigned crew and booked acts are kept."
        : "This restores overview fields, times, schedule blocks, and unassigned crew shifts, and clears the detached state. Assigned crew shifts are kept.",
      confirmLabel: "Reset",
    });
    if (!shouldReset) return;
    try {
      await reattachOccurrence({ eventId });
      // Re-hydrate local form state from the restored occurrence.
      setHydrationToken((token) => token + 1);
      notify.success(multiDay ? "Day reset to the booking template." : "Occurrence reset to series template.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Failed to reset occurrence."));
    }
  }

  async function deleteEvent() {
    const alreadyCancelled = normalizeEventStatus(eventData?.event.status) === "cancelled";
    const shouldDelete = await confirm({
      title: alreadyCancelled ? "Permanently delete this cancelled event?" : "Cancel and delete this event?",
      description:
        "This permanently deletes the event, including all schedule, crew, and pull-list data. This cannot be undone.",
      destructive: true,
    });
    if (!shouldDelete) return;
    try {
      if (!alreadyCancelled) await setEventStatus({ id: eventId, status: "cancelled" });
      await deleteEventAdmin({ id: eventId });
      router.push("/dashboard/events");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function removeUnlinkedShifts() {
    const shouldDelete = await confirm({
      title: "Delete unlinked shifts?",
      description:
        "Deletes crew shifts that aren't on any section of the run of show. Trainees stay.",
      destructive: true,
      confirmLabel: "Delete shifts",
    });
    if (!shouldDelete) return;
    try {
      const result = await deleteUnassignedShifts({ eventId });
      const remaining = shifts.filter((shift) => !isShiftUnlinked(shift));
      setShifts(remaining);
      // Server already dropped these rows; keep them out of the unsaved diff.
      setScheduleBaseline((prev) => {
        if (!prev) return prev;
        const saved = JSON.parse(prev) as SavedSchedule;
        return JSON.stringify({
          blocks: saved.blocks,
          shifts: saved.shifts.filter(
            (shift) =>
              isTraineeShift(shift) ||
              saved.blocks.some(
                (block) => isSectionBlockType(block.blockType) && shiftBelongsToBlock(shift, block),
              ),
          ),
        });
      });
      notify.success(
        `Deleted ${result.deletedCount} unlinked shift${result.deletedCount === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  return {
    eventId,
    eventData,
    siblingDays,
    isAdmin,
    canSeeBilling,
    canEdit,
    readOnly,
    activeTab: resolvedActiveTab,
    visibleTabs,
    draft,
    updateDraft,
    baseline,
    dirty,
    saveStatus,
    saveError,
    saveAll,
    discardChanges,
    clearSavedStatus,
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
    seriesMeta,
    linkedInvoice,
    effectivePrimaryHostGroupId,
    editScopeRequest,
    switchToDay,
    applySetupOpen,
    setApplySetupOpen,
    applySetupToOtherDays,
    resetToSeries,
    deleteEvent,
  };
}

type EventWorkspace = ReturnType<typeof useEventWorkspaceState>;

const EventWorkspaceContext = createContext<EventWorkspace | null>(null);

export function EventWorkspaceProvider({
  eventId,
  activeTab,
  children,
}: {
  eventId: Id<"events">;
  activeTab: EventEditorTabId;
  children: ReactNode;
}) {
  const value = useEventWorkspaceState(eventId, activeTab);
  return <EventWorkspaceContext.Provider value={value}>{children}</EventWorkspaceContext.Provider>;
}

export function useEventWorkspace() {
  const value = useContext(EventWorkspaceContext);
  if (!value) throw new Error("useEventWorkspace must be used inside EventWorkspaceProvider.");
  return value;
}
