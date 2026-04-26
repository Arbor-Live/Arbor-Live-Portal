"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  FilmSlateIcon,
  GearIcon,
  MegaphoneIcon,
  PackageIcon,
  PaintBrushIcon,
  SpeakerHighIcon,
  TruckIcon,
  WrenchIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";
import { EventTimelineScheduler, type TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { authClient } from "@/lib/auth-client";

type EventStatus = "draft" | "active" | "completed" | "cancelled";
type EventType = "Crewed Event" | "Rental with Crew" | "Dry Hire" | "Services Only";
type StoredEventType = EventType | "Dry Rental";
type EventTeam = "Design" | "Marketing" | "Lighting" | "Sound" | "Operations";
type ShiftDraft = {
  id?: Id<"eventCrewShifts">;
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  scheduleBlockRef?: string;
  expenseReportId?: Id<"eventExpenseReports">;
  role: string;
  userId?: string;
  personName: string;
  startsAt: string;
  endsAt: string;
  postedToExpense: boolean;
  notes: string;
};

const EVENT_TYPES: EventType[] = ["Crewed Event", "Rental with Crew", "Dry Hire", "Services Only"];
const EVENT_TEAMS: EventTeam[] = ["Design", "Marketing", "Lighting", "Sound", "Operations"];
const EVENT_TYPE_ICONS: Record<EventType, Icon> = {
  "Crewed Event": FilmSlateIcon,
  "Rental with Crew": TruckIcon,
  "Dry Hire": PackageIcon,
  "Services Only": WrenchIcon,
};
const TEAM_ICONS: Record<EventTeam, Icon> = {
  Design: PaintBrushIcon,
  Marketing: MegaphoneIcon,
  Lighting: GearIcon,
  Sound: SpeakerHighIcon,
  Operations: WrenchIcon,
};

function toLocalDateTimeInput(value: number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatHours(value: number) {
  return `${value.toFixed(2)}h`;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const tabs = ["overview", "schedule", "artifacts", "expenses"] as const;
type TabId = (typeof tabs)[number];
const TAB_LABELS: Record<TabId, string> = {
  overview: "Overview",
  schedule: "Schedule",
  artifacts: "Artifacts",
  expenses: "Expenses",
};

function normalizeEventType(value: StoredEventType | undefined): EventType {
  if (value === "Dry Rental") return "Dry Hire";
  return value ?? "Crewed Event";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof (error as { data?: { message?: unknown } }).data?.message === "string"
  ) {
    return (error as { data: { message: string } }).data.message;
  }
  return "Something went wrong while saving. Please try again.";
}

export function EventEditor({ eventId }: { eventId?: Id<"events"> }) {
  const router = useRouter();
  const session = authClient.useSession();
  const isCreate = !eventId;
  const eventData = useQuery(api.events.get, eventId ? { id: eventId } : "skip");
  const invoices = useQuery(api.invoices.list, {});
  const managerList = useQuery(api.invoices.listManagers, {});
  const createEvent = useMutation(api.events.create);
  const updateEvent = useMutation(api.events.update);
  const upsertBlocks = useMutation(api.eventSchedule.upsertBlocks);
  const upsertShifts = useMutation(api.eventCrew.upsertShifts);
  const createArtifact = useMutation(api.eventArtifacts.create);

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<EventStatus>("draft");
  const [invoiceId, setInvoiceId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [endAtTouched, setEndAtTouched] = useState(false);
  const [venueName, setVenueName] = useState("");
  const [eventType, setEventType] = useState<EventType>("Crewed Event");
  const [teamsInterested, setTeamsInterested] = useState<EventTeam[]>([]);
  const [host, setHost] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [dayOfLeadUserId, setDayOfLeadUserId] = useState("");
  const [crewCostUsd, setCrewCostUsd] = useState("0");
  const [bandsCostUsd, setBandsCostUsd] = useState("0");
  const [externalRentalsCostUsd, setExternalRentalsCostUsd] = useState("0");
  const [notes, setNotes] = useState("");
  const [blocks, setBlocks] = useState<TimelineBlockDraft[]>([]);
  const [shifts, setShifts] = useState<ShiftDraft[]>([]);
  const [selectedCrewUserId, setSelectedCrewUserId] = useState("");
  const [artifactType, setArtifactType] = useState<"note" | "instruction" | "document" | "pull_list">("note");
  const [artifactTitle, setArtifactTitle] = useState("");
  const [artifactMarkdown, setArtifactMarkdown] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const hydratedEventIdRef = useRef<string | null>(null);
  const localBlockCounterRef = useRef(0);

  function makeLocalBlockRef() {
    localBlockCounterRef.current += 1;
    return `local-block-${localBlockCounterRef.current}`;
  }

  function withStableBlockRefs(nextBlocks: TimelineBlockDraft[]) {
    return nextBlocks.map((block) =>
      block.id || block.clientId
        ? block
        : {
            ...block,
            clientId: makeLocalBlockRef(),
          },
    );
  }

  function getBlockRef(block: TimelineBlockDraft) {
    return block.id ?? block.clientId;
  }

  function mapPersistedBlockIdByRef(inputBlocks: TimelineBlockDraft[]) {
    const result = new Map<string, Id<"eventScheduleBlocks">>();
    for (const block of inputBlocks) {
      if (!block.id) continue;
      if (block.clientId) {
        result.set(block.clientId, block.id as Id<"eventScheduleBlocks">);
      }
      result.set(block.id, block.id as Id<"eventScheduleBlocks">);
    }
    return result;
  }

  useEffect(() => {
    if (!eventData?.event) return;
    if (hydratedEventIdRef.current === eventData.event._id) return;
    hydratedEventIdRef.current = eventData.event._id;
    setTitle(eventData.event.title);
    setStatus(eventData.event.status);
    setInvoiceId(eventData.event.invoiceId ?? "");
    setStartAt(toLocalDateTimeInput(eventData.event.startAt));
    setEndAt(toLocalDateTimeInput(eventData.event.endAt));
    setEndAtTouched(true);
    setVenueName(eventData.event.venueName ?? "");
    setEventType(normalizeEventType(eventData.event.eventType as StoredEventType | undefined));
    setTeamsInterested((eventData.event.teamsInterested as EventTeam[] | undefined) ?? []);
    setHost(eventData.event.host ?? "");
    setManagerUserId(eventData.event.eventManagerUserId ?? "");
    setDayOfLeadUserId(eventData.event.dayOfLeadUserId ?? "");
    setCrewCostUsd((eventData.event.crewCostUsd ?? 0).toString());
    setBandsCostUsd((eventData.event.bandsCostUsd ?? 0).toString());
    setExternalRentalsCostUsd((eventData.event.externalRentalsCostUsd ?? 0).toString());
    setNotes(eventData.event.notes ?? "");
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
        postedToExpense: row.postedToExpense,
        notes: row.notes ?? "",
      })),
    );
  }, [eventData]);

  const hideSchedule = eventType === "Services Only";
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => !(hideSchedule && tab === "schedule")),
    [hideSchedule],
  );

  const resolvedActiveTab: TabId = visibleTabs.includes(activeTab) ? activeTab : "overview";

  const dayCount = useMemo(() => {
    if (!startAt || !endAt) return 1;
    const start = new Date(startAt);
    const end = new Date(endAt);
    const diff = Math.max(0, end.getTime() - start.getTime());
    return Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)) + 1);
  }, [startAt, endAt]);

  const statusOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: "draft", label: "draft" },
      { value: "active", label: "active" },
      { value: "completed", label: "completed" },
      { value: "cancelled", label: "cancelled" },
    ],
    [],
  );

  const invoiceOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: "", label: "No linked invoice" },
      ...((invoices ?? []).map((row) => ({
        value: row._id,
        label: row.invoiceNumber,
        description: row.clientGroupName ?? row.managerName,
      })) satisfies SearchableSelectOption[]),
    ],
    [invoices],
  );

  const eventTypeOptions: SearchableSelectOption[] = useMemo(
    () =>
      EVENT_TYPES.map((type) => ({
        value: type,
        label: type,
      })),
    [],
  );

  const userOptions: SearchableSelectOption[] = useMemo(() => {
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

  async function saveCore() {
    if (!title.trim() || !startAt || !endAt) {
      setMessageTone("error");
      setMessage("Title, start, and end are required.");
      return;
    }
    const payload = {
      title: title.trim(),
      status,
      invoiceId: invoiceId ? (invoiceId as Id<"invoices">) : undefined,
      startAt: new Date(startAt).getTime(),
      endAt: new Date(endAt).getTime(),
      venueName: venueName || undefined,
      eventType: eventType || undefined,
      teamsInterested: teamsInterested.length > 0 ? teamsInterested : undefined,
      host: host || undefined,
      eventManagerUserId: managerUserId || undefined,
      dayOfLeadUserId: dayOfLeadUserId || undefined,
      bandsCostUsd: Number(bandsCostUsd || "0"),
      externalRentalsCostUsd: Number(externalRentalsCostUsd || "0"),
      notes: notes || undefined,
    };
    try {
      if (isCreate) {
        const id = await createEvent({ ...payload, visibility: "internal" });
        router.replace(`/dashboard/events/${id}`);
        return;
      }
      await updateEvent({ id: eventId!, ...payload });
      setMessageTone("success");
      setMessage("Overview saved.");
    } catch (error) {
      setMessageTone("error");
      setMessage(`Overview error: ${getErrorMessage(error)}`);
    }
  }

  async function saveSchedule() {
    if (!eventId) return;
    try {
      const blocksWithRefs = withStableBlockRefs(blocks);
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
      setMessageTone("success");
      setMessage("Schedule saved.");
    } catch (error) {
      setMessageTone("error");
      setMessage(`Schedule error: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  async function saveShifts() {
    if (!eventId) return;
    try {
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
          postedToExpense: row.postedToExpense,
          notes: row.notes || undefined,
        })),
      });
      setMessageTone("success");
      setMessage("Schedule personnel saved.");
    } catch (error) {
      setMessageTone("error");
      setMessage(`Schedule personnel error: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  function addPersonnelShift(block: TimelineBlockDraft, options?: { userId?: string }) {
    const blockRef = getBlockRef(block);
    const selectedUser =
      options?.userId ? userOptions.find((option) => option.value === options.userId) : undefined;
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
        postedToExpense: false,
        notes: "",
      },
    ]);
  }

  async function saveScheduleAndPersonnel() {
    try {
      await saveSchedule();
      if (!eventId) return;
      await saveShifts();
      setMessageTone("success");
      setMessage("Schedule and assigned personnel saved.");
    } catch {
      // Individual save handlers already set section-specific messages.
    }
  }

  const currentEventId = eventId ?? eventData?.event?._id;
  const computedCrewCost = useQuery(
    api.eventCrew.getComputedCrewCost,
    currentEventId ? { eventId: currentEventId } : "skip",
  );
  const quickAddDisabled = !startAt || !endAt;
  const quickAddDisabledReason = quickAddDisabled ? "Set event start and end first." : undefined;
  const quickAddLabel =
    eventType === "Dry Hire"
      ? "Quick Add: Delivery + Return"
      : eventType === "Rental with Crew"
        ? "Quick Add: Setup + Strike"
        : "Quick Add: Setup + Show + Strike";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{isCreate ? "Create Event" : "Edit Event"}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {visibleTabs.map((tab) => (
            <Button key={tab} type="button" variant={resolvedActiveTab === tab ? "default" : "outline"} onClick={() => setActiveTab(tab)}>
              {TAB_LABELS[tab]}
            </Button>
          ))}
          <Button type="button" onClick={() => void saveCore()} className="ml-auto">
            {isCreate ? "Create Event" : "Save Event"}
          </Button>
        </CardContent>
      </Card>

      {message ? (
        <p className={`rounded-md border px-3 py-2 text-sm ${messageTone === "error" ? "border-rose-500/40 bg-rose-500/10 text-rose-800" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"}`}>
          {message}
        </p>
      ) : null}

      {resolvedActiveTab === "overview" ? (
        <Card>
          <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <SearchableSelect
                value={status}
                onChange={(value) => setStatus(value as EventStatus)}
                options={statusOptions}
                placeholder="Search status..."
                emptyLabel="Select status"
              />
            </div>
            <div className="space-y-1">
              <Label>Linked Invoice (optional)</Label>
              <SearchableSelect
                value={invoiceId}
                onChange={setInvoiceId}
                options={invoiceOptions}
                placeholder="Search invoice..."
                emptyLabel="No linked invoice"
              />
            </div>
            <div className="space-y-1">
              <Label>Start</Label>
              <DateTimePicker
                value={startAt}
                onChange={(value) => {
                  setStartAt(value);
                  if (!endAtTouched) setEndAt(value);
                }}
                placeholder="Select start date/time"
              />
            </div>
            <div className="space-y-1">
              <Label>End</Label>
              <DateTimePicker
                value={endAt}
                onChange={(value) => {
                  setEndAt(value);
                  setEndAtTouched(value.length > 0);
                }}
                placeholder="Select end date/time"
              />
            </div>
            <div className="space-y-1">
              <Label>Venue</Label>
              <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Event Type</Label>
              <SearchableSelect
                value={eventType}
                onChange={(value) => setEventType(value as EventType)}
                options={eventTypeOptions}
                placeholder="Search event types..."
                emptyLabel="Select event type"
                renderOption={(option) => {
                  const Icon = EVENT_TYPE_ICONS[option.value as EventType];
                  return (
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-muted-foreground" />
                      <span>{option.label}</span>
                    </div>
                  );
                }}
                renderSelected={(option) => {
                  if (!option) return <span className="truncate text-muted-foreground">Select event type</span>;
                  const Icon = EVENT_TYPE_ICONS[option.value as EventType];
                  return (
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="truncate">{option.label}</span>
                    </div>
                  );
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Host</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>Teams Interested</Label>
              <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {EVENT_TEAMS.map((team) => {
                  const checked = teamsInterested.includes(team);
                  const Icon = TEAM_ICONS[team];
                  return (
                    <label key={team} className="flex items-center gap-2 rounded-md border px-3 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setTeamsInterested((prev) =>
                            e.target.checked ? [...prev, team] : prev.filter((entry) => entry !== team),
                          )
                        }
                      />
                      <Icon className="size-4 text-muted-foreground" />
                      {team}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Event Manager User ID</Label>
              <UserSelect
                value={managerUserId}
                onChange={setManagerUserId}
                options={userSelectOptions}
                emptyLabel="Select event manager"
              />
            </div>
            <div className="space-y-1">
              <Label>Day-Of Lead User ID</Label>
              <UserSelect
                value={dayOfLeadUserId}
                onChange={setDayOfLeadUserId}
                options={userSelectOptions}
                emptyLabel="Select day-of lead"
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>Notes</Label>
              <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {resolvedActiveTab === "schedule" ? (
        <Card>
          <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <EventTimelineScheduler
              dayCount={dayCount}
              blocks={blocks}
              onChange={(next) => setBlocks(withStableBlockRefs(next))}
              quickAddLabel={quickAddLabel}
              quickAddDisabled={quickAddDisabled}
              quickAddDisabledReason={quickAddDisabledReason}
              onQuickAdd={() => {
                if (quickAddDisabled) return;
                const showStart = new Date(startAt);
                const showEnd = new Date(endAt);
                const setupStart = new Date(showStart.getTime() - 3 * 60 * 60 * 1000);
                const strikeEnd = new Date(showEnd.getTime() + 2 * 60 * 60 * 1000);
                const deliveryStart = new Date(showStart.getTime() - 2 * 60 * 60 * 1000);
                const returnEnd = new Date(showEnd.getTime() + 2 * 60 * 60 * 1000);
                const anchorDayStart = new Date(
                  showStart.getFullYear(),
                  showStart.getMonth(),
                  showStart.getDate(),
                ).getTime();
                const setupDayIndex = Math.max(
                  0,
                  Math.floor((setupStart.getTime() - anchorDayStart) / (24 * 60 * 60 * 1000)),
                );
                const showDayIndex = 0;
                const strikeDayIndex = Math.max(
                  0,
                  Math.floor((showEnd.getTime() - anchorDayStart) / (24 * 60 * 60 * 1000)),
                );
                const deliveryDayIndex = Math.max(
                  0,
                  Math.floor((deliveryStart.getTime() - anchorDayStart) / (24 * 60 * 60 * 1000)),
                );
                const returnDayIndex = Math.max(
                  0,
                  Math.floor((showEnd.getTime() - anchorDayStart) / (24 * 60 * 60 * 1000)),
                );

                if (eventType === "Dry Hire") {
                  setBlocks(
                    withStableBlockRefs([
                    {
                      blockType: "setup",
                      label: "Delivery Slot",
                      dayIndex: deliveryDayIndex,
                      startsAt: toLocalDateTimeInput(deliveryStart),
                      endsAt: toLocalDateTimeInput(showStart),
                      notes: "",
                    },
                    {
                      blockType: "strike",
                      label: "Return Slot",
                      dayIndex: returnDayIndex,
                      startsAt: toLocalDateTimeInput(showEnd),
                      endsAt: toLocalDateTimeInput(returnEnd),
                      notes: "",
                    },
                    ]),
                  );
                  return;
                }

                const baseBlocks: TimelineBlockDraft[] = [
                  {
                    blockType: "setup",
                    label: "Setup",
                    dayIndex: setupDayIndex,
                    startsAt: toLocalDateTimeInput(setupStart),
                    endsAt: toLocalDateTimeInput(showStart),
                    notes: "",
                  },
                  {
                    blockType: "strike",
                    label: "Strike",
                    dayIndex: strikeDayIndex,
                    startsAt: toLocalDateTimeInput(showEnd),
                    endsAt: toLocalDateTimeInput(strikeEnd),
                    notes: "",
                  },
                ];

                if (eventType === "Crewed Event") {
                  baseBlocks.splice(1, 0, {
                    blockType: "show",
                    label: "Show",
                    dayIndex: showDayIndex,
                    startsAt: toLocalDateTimeInput(showStart),
                    endsAt: toLocalDateTimeInput(showEnd),
                    notes: "",
                  });
                }

                setBlocks(withStableBlockRefs(baseBlocks));
              }}
            />
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
                  ? `Selected: ${selectedCrewUserOption.label}. Use this to quickly add the same crew member across multiple schedule blocks.`
                  : "Select a crew user, then use Add Shift for Selected User on each block."}
              </p>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Assigned Personnel by Block</p>
              {blocks.map((block, blockIndex) => {
                const blockRef = getBlockRef(block);
                const blockShifts = shifts.filter((shift) => shift.scheduleBlockRef === blockRef);
                return (
                  <div key={blockRef ?? `block-assignment-${blockIndex}`} className="space-y-2 rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {block.label || `Block ${blockIndex + 1}`} ({block.blockType})
                      </p>
                      <div className="flex items-center gap-2">
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
                        return (
                          <div key={row.id ?? `${blockRef ?? blockIndex}-shift-${rowIndex}`} className="grid gap-2 md:grid-cols-6">
                            <Input
                              placeholder="Role"
                              value={row.role}
                              onChange={(e) =>
                                setShifts((prev) =>
                                  prev.map((shift, i) => (i === shiftIndex ? { ...shift, role: e.target.value } : shift)),
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
                                            userOptions.find((option) => option.value === value)?.label ?? shift.personName,
                                        }
                                      : shift,
                                  ),
                                )
                              }
                              options={userSelectOptions}
                              emptyLabel="Select crew user"
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
                            <label className="flex items-center gap-2 rounded-md border px-3 text-sm">
                              <input
                                type="checkbox"
                                checked={row.postedToExpense}
                                onChange={(e) =>
                                  setShifts((prev) =>
                                    prev.map((shift, i) =>
                                      i === shiftIndex ? { ...shift, postedToExpense: e.target.checked } : shift,
                                    ),
                                  )
                                }
                              />
                              Posted
                            </label>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setShifts((prev) => prev.filter((_, i) => i !== shiftIndex))}
                            >
                              Remove
                            </Button>
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
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700">
                  Some legacy shifts are not assigned to a schedule block yet. Assign them by adding personnel on a block.
                </div>
              ) : null}
            </div>
            <Button type="button" disabled={!eventId} onClick={() => void saveScheduleAndPersonnel()}>
              Save Schedule & Personnel
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {resolvedActiveTab === "artifacts" ? (
        <Card>
          <CardHeader><CardTitle>Artifacts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-4">
              <SearchableSelect
                value={artifactType}
                onChange={(value) => setArtifactType(value as typeof artifactType)}
                options={[
                  { value: "note", label: "note" },
                  { value: "instruction", label: "instruction" },
                  { value: "document", label: "document" },
                  { value: "pull_list", label: "pull_list" },
                ]}
                placeholder="Search artifact type..."
                emptyLabel="Select artifact type"
              />
              <Input placeholder="Title" value={artifactTitle} onChange={(e) => setArtifactTitle(e.target.value)} />
              <Input placeholder="Markdown/content" value={artifactMarkdown} onChange={(e) => setArtifactMarkdown(e.target.value)} />
              <Button
                type="button"
                disabled={!currentEventId}
                onClick={async () => {
                  if (!currentEventId) return;
                  await createArtifact({
                    eventId: currentEventId,
                    artifactType,
                    title: artifactTitle,
                    markdown: artifactMarkdown || undefined,
                  });
                  setArtifactTitle("");
                  setArtifactMarkdown("");
                  setMessage("Artifact added.");
                }}
              >
                Add Artifact
              </Button>
            </div>
            <div className="space-y-1">
              {(eventData?.artifacts ?? []).map((row) => (
                <div key={row._id} className="rounded-md border px-3 py-2 text-sm">
                  <p className="font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">{row.artifactType}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {resolvedActiveTab === "expenses" ? (
        <Card>
          <CardHeader><CardTitle>Event Costs</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Crew costs are auto-calculated from assigned users in schedule shifts:
              each user uses their hourly rate, and hours beyond 8/day are billed at 1.5x.
            </p>
            <div className="grid gap-2 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Crew Cost (USD)</Label>
                <Input value={computedCrewCost ? computedCrewCost.totalCostUsd.toFixed(2) : crewCostUsd} readOnly />
              </div>
              <div className="space-y-1">
                <Label>Regular Hours</Label>
                <Input value={computedCrewCost ? computedCrewCost.totalRegularHours.toFixed(2) : "0.00"} readOnly />
              </div>
              <div className="space-y-1">
                <Label>Overtime Hours</Label>
                <Input value={computedCrewCost ? computedCrewCost.totalOvertimeHours.toFixed(2) : "0.00"} readOnly />
              </div>
              <div className="space-y-1">
                <Label>Bands Cost (USD)</Label>
                <Input value={bandsCostUsd} onChange={(e) => setBandsCostUsd(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>External Rentals Cost (USD)</Label>
                <Input
                  value={externalRentalsCostUsd}
                  onChange={(e) => setExternalRentalsCostUsd(e.target.value)}
                />
              </div>
            </div>
            {computedCrewCost?.missingRateUsers?.length ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800">
                Missing hourly rates for: {computedCrewCost.missingRateUsers.join(", ")}. These rows are included at
                $0.00 until a base rate is added.
              </div>
            ) : null}
            {computedCrewCost ? (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Crew Expense Breakdown by Schedule Block</p>
                  <p className="text-xs text-muted-foreground">
                    OT multiplier: {computedCrewCost.overtimeMultiplier.toFixed(2)}x
                  </p>
                </div>
                {computedCrewCost.byScheduleBlock.length ? (
                  <div className="space-y-3">
                    {computedCrewCost.byScheduleBlock.map((block, index) => (
                      <div key={block.scheduleBlockId ?? `${block.blockLabel}-${index}`} className="rounded-md border">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">
                              {block.blockLabel}
                              {block.blockType ? ` (${block.blockType})` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Regular {formatHours(block.regularHours)} • OT {formatHours(block.overtimeHours)}
                            </p>
                          </div>
                          <p className="text-sm font-semibold">{formatCurrency(block.subtotalUsd)}</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/30 text-left">
                                <th className="px-3 py-2 font-medium">Crew</th>
                                <th className="px-3 py-2 font-medium">Role</th>
                                <th className="px-3 py-2 font-medium">Shift</th>
                                <th className="px-3 py-2 font-medium">Hours (Reg / OT)</th>
                                <th className="px-3 py-2 font-medium">Rate (Base / OT)</th>
                                <th className="px-3 py-2 font-medium text-right">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {block.rows.map((row) => (
                                <tr key={row.shiftId} className="border-b last:border-b-0">
                                  <td className="px-3 py-2">
                                    <p>{row.name}</p>
                                    {row.missingRate ? (
                                      <p className="text-[11px] text-amber-700">Missing base rate</p>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2">{row.role || "—"}</td>
                                  <td className="px-3 py-2">
                                    {formatDateTime(row.startsAt)} - {formatDateTime(row.endsAt)}
                                  </td>
                                  <td className="px-3 py-2">
                                    {formatHours(row.regularHours)} / {formatHours(row.overtimeHours)}
                                  </td>
                                  <td className="px-3 py-2">
                                    {formatCurrency(row.baseRateUsd)} / {formatCurrency(row.overtimeRateUsd)}
                                  </td>
                                  <td className="px-3 py-2 text-right">{formatCurrency(row.subtotalUsd)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No schedule-linked crew shifts found yet.</p>
                )}
              </div>
            ) : null}
            <Button type="button" onClick={() => void saveCore()}>
              Save Event Costs
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
