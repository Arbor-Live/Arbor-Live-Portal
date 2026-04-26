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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";
import { EventTimelineScheduler, type TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { authClient } from "@/lib/auth-client";

type EventStatus = "draft" | "active" | "completed" | "cancelled";
type EventType = "Crewed Event" | "Rental with Crew" | "Dry Rental" | "Services Only";
type EventTeam = "Design" | "Marketing" | "Lighting" | "Sound" | "Operations";

const EVENT_TYPES: EventType[] = ["Crewed Event", "Rental with Crew", "Dry Rental", "Services Only"];
const EVENT_TEAMS: EventTeam[] = ["Design", "Marketing", "Lighting", "Sound", "Operations"];
const EVENT_TIMEZONE = "America/Los_Angeles";
const EVENT_TYPE_ICONS: Record<EventType, Icon> = {
  "Crewed Event": FilmSlateIcon,
  "Rental with Crew": TruckIcon,
  "Dry Rental": PackageIcon,
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

const tabs = ["overview", "schedule", "crew", "artifacts", "expenses"] as const;
type TabId = (typeof tabs)[number];

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
  const upsertAssignments = useMutation(api.eventAssignments.upsertAssignments);
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
  const [shifts, setShifts] = useState<
    Array<{
      id?: Id<"eventCrewShifts">;
      scheduleBlockId?: Id<"eventScheduleBlocks">;
      expenseReportId?: Id<"eventExpenseReports">;
      role: string;
      personName: string;
      startsAt: string;
      endsAt: string;
      postedToExpense: boolean;
      notes: string;
    }>
  >([]);
  const [assignments, setAssignments] = useState<
    Array<{
      id?: Id<"eventPeopleAssignments">;
      assignmentType: "event_manager" | "day_of_lead" | "crew" | "performer" | "support" | "contact";
      roleLabel: string;
      personName: string;
      contactEmail: string;
      contactPhone: string;
      notes: string;
    }>
  >([]);
  const [artifactType, setArtifactType] = useState<"note" | "instruction" | "document" | "pull_list">("note");
  const [artifactTitle, setArtifactTitle] = useState("");
  const [artifactMarkdown, setArtifactMarkdown] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const hydratedEventIdRef = useRef<string | null>(null);

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
    setEventType((eventData.event.eventType as EventType | undefined) ?? "Crewed Event");
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
        expenseReportId: row.expenseReportId,
        role: row.role,
        personName: row.personName ?? "",
        startsAt: toLocalDateTimeInput(row.startsAt),
        endsAt: toLocalDateTimeInput(row.endsAt),
        postedToExpense: row.postedToExpense,
        notes: row.notes ?? "",
      })),
    );
    setAssignments(
      eventData.assignments.map((row) => ({
        id: row._id,
        assignmentType: row.assignmentType,
        roleLabel: row.roleLabel ?? "",
        personName: row.personName,
        contactEmail: row.contactEmail ?? "",
        contactPhone: row.contactPhone ?? "",
        notes: row.notes ?? "",
      })),
    );
  }, [eventData]);

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

  function initials(value?: string) {
    if (!value) return "U";
    return value
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  async function saveCore() {
    if (!title.trim() || !startAt || !endAt) {
      setMessage("Title, start, and end are required.");
      return;
    }
    const payload = {
      title: title.trim(),
      status,
      invoiceId: invoiceId ? (invoiceId as Id<"invoices">) : undefined,
      startAt: new Date(startAt).getTime(),
      endAt: new Date(endAt).getTime(),
      timezone: EVENT_TIMEZONE,
      venueName: venueName || undefined,
      eventType: eventType || undefined,
      teamsInterested: teamsInterested.length > 0 ? teamsInterested : undefined,
      host: host || undefined,
      eventManagerUserId: managerUserId || undefined,
      dayOfLeadUserId: dayOfLeadUserId || undefined,
      crewCostUsd: Number(crewCostUsd || "0"),
      bandsCostUsd: Number(bandsCostUsd || "0"),
      externalRentalsCostUsd: Number(externalRentalsCostUsd || "0"),
      notes: notes || undefined,
    };
    if (isCreate) {
      const id = await createEvent({ ...payload, visibility: "internal" });
      router.replace(`/dashboard/events/${id}`);
      return;
    }
    await updateEvent({ id: eventId!, ...payload });
    setMessage("Event details saved.");
  }

  async function saveSchedule() {
    if (!eventId) return;
    await upsertBlocks({
      eventId,
      blocks: blocks.map((row) => ({
        id: row.id as Id<"eventScheduleBlocks"> | undefined,
        blockType: row.blockType,
        label: row.label,
        dayIndex: row.dayIndex,
        startsAt: new Date(row.startsAt).getTime(),
        endsAt: new Date(row.endsAt).getTime(),
        notes: row.notes || undefined,
      })),
    });
    setMessage("Schedule saved.");
  }

  async function saveShifts() {
    if (!eventId) return;
    const validBlockIds = new Set(blocks.map((block) => block.id).filter(Boolean));
    await upsertShifts({
      eventId,
      shifts: shifts.map((row) => ({
        id: row.id,
        expenseReportId: row.expenseReportId,
        scheduleBlockId: row.scheduleBlockId && validBlockIds.has(row.scheduleBlockId) ? row.scheduleBlockId : undefined,
        role: row.role,
        personName: row.personName || undefined,
        startsAt: new Date(row.startsAt).getTime(),
        endsAt: new Date(row.endsAt).getTime(),
        postedToExpense: row.postedToExpense,
        notes: row.notes || undefined,
      })),
    });
    setMessage("Crew shifts saved.");
  }

  function addPersonnelShift(block: TimelineBlockDraft) {
    if (!block.id) {
      setMessage("Save schedule first so this block can be assigned personnel.");
      return;
    }
    setShifts((prev) => [
      ...prev,
      {
        scheduleBlockId: block.id as Id<"eventScheduleBlocks">,
        role: "",
        personName: "",
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        postedToExpense: false,
        notes: "",
      },
    ]);
  }

  async function saveScheduleAndPersonnel() {
    await saveSchedule();
    if (!eventId) return;
    await saveShifts();
    setMessage("Schedule and assigned personnel saved.");
  }

  async function saveAssignments() {
    if (!eventId) return;
    await upsertAssignments({
      eventId,
      assignments: assignments.map((row) => ({
        id: row.id,
        assignmentType: row.assignmentType,
        roleLabel: row.roleLabel || undefined,
        personName: row.personName,
        contactEmail: row.contactEmail || undefined,
        contactPhone: row.contactPhone || undefined,
        notes: row.notes || undefined,
      })),
    });
    setMessage("Assignments saved.");
  }

  const currentEventId = eventId ?? eventData?.event?._id;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{isCreate ? "Create Event" : "Edit Event"}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Button key={tab} type="button" variant={activeTab === tab ? "default" : "outline"} onClick={() => setActiveTab(tab)}>
              {tab}
            </Button>
          ))}
          <Button type="button" onClick={() => void saveCore()} className="ml-auto">
            {isCreate ? "Create Event" : "Save Event"}
          </Button>
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-primary">{message}</p> : null}

      {activeTab === "overview" ? (
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
              <SearchableSelect
                value={managerUserId}
                onChange={setManagerUserId}
                options={userOptions}
                placeholder="Search users..."
                emptyLabel="Select event manager"
                renderOption={(option) => (
                  <div className="flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarImage src={option.avatarUrl} alt={option.label} />
                      <AvatarFallback>{initials(option.label)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate">{option.label}</p>
                      {option.description ? (
                        <p className="truncate text-xs text-muted-foreground">{option.description}</p>
                      ) : null}
                    </div>
                  </div>
                )}
                renderSelected={(option) => (
                  <div className="flex items-center gap-2">
                    {option ? (
                      <>
                        <Avatar size="sm">
                          <AvatarImage src={option.avatarUrl} alt={option.label} />
                          <AvatarFallback>{initials(option.label)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate">{option.label}</span>
                      </>
                    ) : (
                      <span className="truncate text-muted-foreground">Select event manager</span>
                    )}
                  </div>
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>Day-Of Lead User ID</Label>
              <SearchableSelect
                value={dayOfLeadUserId}
                onChange={setDayOfLeadUserId}
                options={userOptions}
                placeholder="Search users..."
                emptyLabel="Select day-of lead"
                renderOption={(option) => (
                  <div className="flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarImage src={option.avatarUrl} alt={option.label} />
                      <AvatarFallback>{initials(option.label)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate">{option.label}</p>
                      {option.description ? (
                        <p className="truncate text-xs text-muted-foreground">{option.description}</p>
                      ) : null}
                    </div>
                  </div>
                )}
                renderSelected={(option) => (
                  <div className="flex items-center gap-2">
                    {option ? (
                      <>
                        <Avatar size="sm">
                          <AvatarImage src={option.avatarUrl} alt={option.label} />
                          <AvatarFallback>{initials(option.label)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate">{option.label}</span>
                      </>
                    ) : (
                      <span className="truncate text-muted-foreground">Select day-of lead</span>
                    )}
                  </div>
                )}
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>Notes</Label>
              <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "schedule" ? (
        <Card>
          <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <EventTimelineScheduler
              dayCount={dayCount}
              blocks={blocks}
              onChange={setBlocks}
              onAddPreset={(preset) => {
                const showStart = startAt ? new Date(startAt) : new Date();
                const showEnd = endAt ? new Date(endAt) : new Date(showStart.getTime() + 3 * 60 * 60 * 1000);
                const setupStart = new Date(showStart.getTime() - 3 * 60 * 60 * 1000);
                const strikeEnd = new Date(showEnd.getTime() + 2 * 60 * 60 * 1000);
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
                if (preset === "full") {
                  setBlocks([
                    {
                      blockType: "setup",
                      label: "Setup",
                      dayIndex: setupDayIndex,
                      startsAt: toLocalDateTimeInput(setupStart),
                      endsAt: toLocalDateTimeInput(showStart),
                      notes: "",
                    },
                    {
                      blockType: "show",
                      label: "Show",
                      dayIndex: showDayIndex,
                      startsAt: toLocalDateTimeInput(showStart),
                      endsAt: toLocalDateTimeInput(showEnd),
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
                  ]);
                } else {
                  setBlocks([
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
                  ]);
                }
              }}
            />
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Assigned Personnel by Block</p>
              {blocks.map((block, blockIndex) => {
                const blockId = block.id as Id<"eventScheduleBlocks"> | undefined;
                const blockShifts = shifts.filter((shift) => shift.scheduleBlockId === blockId);
                return (
                  <div key={block.id ?? `block-assignment-${blockIndex}`} className="space-y-2 rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {block.label || `Block ${blockIndex + 1}`} ({block.blockType})
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={() => addPersonnelShift(block)}>
                        Add Personnel
                      </Button>
                    </div>
                    {blockShifts.length ? (
                      blockShifts.map((row, rowIndex) => {
                        const shiftIndex = shifts.findIndex((entry) => entry === row);
                        return (
                          <div key={row.id ?? `${block.id ?? blockIndex}-shift-${rowIndex}`} className="grid gap-2 md:grid-cols-6">
                            <Input
                              placeholder="Role"
                              value={row.role}
                              onChange={(e) =>
                                setShifts((prev) =>
                                  prev.map((shift, i) => (i === shiftIndex ? { ...shift, role: e.target.value } : shift)),
                                )
                              }
                            />
                            <Input
                              placeholder="Person"
                              value={row.personName}
                              onChange={(e) =>
                                setShifts((prev) =>
                                  prev.map((shift, i) =>
                                    i === shiftIndex ? { ...shift, personName: e.target.value } : shift,
                                  ),
                                )
                              }
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
              {shifts.some((shift) => !shift.scheduleBlockId) ? (
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

      {activeTab === "crew" ? (
        <Card>
          <CardHeader><CardTitle>Crew & Assignments</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">Assignments</p>
            {assignments.map((row, index) => (
              <div key={row.id ?? `assignment-${index}`} className="grid gap-2 md:grid-cols-7">
                <SearchableSelect
                  value={row.assignmentType}
                  onChange={(value) =>
                    setAssignments((prev) =>
                      prev.map((entry, i) =>
                        i === index
                          ? {
                              ...entry,
                              assignmentType: value as typeof row.assignmentType,
                            }
                          : entry,
                      ),
                    )
                  }
                  options={[
                    { value: "event_manager", label: "event_manager" },
                    { value: "day_of_lead", label: "day_of_lead" },
                    { value: "crew", label: "crew" },
                    { value: "performer", label: "performer" },
                    { value: "support", label: "support" },
                    { value: "contact", label: "contact" },
                  ]}
                  placeholder="Search assignment type..."
                  emptyLabel="Select assignment type"
                />
                <Input placeholder="Role label" value={row.roleLabel} onChange={(e) => setAssignments((prev) => prev.map((entry, i) => (i === index ? { ...entry, roleLabel: e.target.value } : entry)))} />
                <Input placeholder="Person name" value={row.personName} onChange={(e) => setAssignments((prev) => prev.map((entry, i) => (i === index ? { ...entry, personName: e.target.value } : entry)))} />
                <Input placeholder="Email" value={row.contactEmail} onChange={(e) => setAssignments((prev) => prev.map((entry, i) => (i === index ? { ...entry, contactEmail: e.target.value } : entry)))} />
                <Input placeholder="Phone" value={row.contactPhone} onChange={(e) => setAssignments((prev) => prev.map((entry, i) => (i === index ? { ...entry, contactPhone: e.target.value } : entry)))} />
                <Input placeholder="Notes" value={row.notes} onChange={(e) => setAssignments((prev) => prev.map((entry, i) => (i === index ? { ...entry, notes: e.target.value } : entry)))} />
                <Button type="button" variant="outline" onClick={() => setAssignments((prev) => prev.filter((_, i) => i !== index))}>
                  Remove
                </Button>
              </div>
            ))}
            <div className="mb-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setAssignments((prev) => [
                    ...prev,
                    { assignmentType: "support", roleLabel: "", personName: "", contactEmail: "", contactPhone: "", notes: "" },
                  ])
                }
              >
                Add Assignment
              </Button>
              <Button type="button" disabled={!eventId} onClick={() => void saveAssignments()}>
                Save Assignments
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Crew shifts are now managed per schedule block in the Schedule tab.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "artifacts" ? (
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

      {activeTab === "expenses" ? (
        <Card>
          <CardHeader><CardTitle>Event Costs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Costs are tracked directly on the event. Bands and external rentals are placeholders for now.
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Crew Cost (USD)</Label>
                <Input value={crewCostUsd} onChange={(e) => setCrewCostUsd(e.target.value)} />
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
            <Button type="button" onClick={() => void saveCore()}>
              Save Event Costs
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
