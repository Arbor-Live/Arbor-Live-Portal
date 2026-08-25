"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { EventArtifactUploadField } from "@/components/files/file-upload-field";
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
import {
  EQUIPMENT_PRICING_MODE_OPTIONS,
  INVOICE_GROUP_TYPE_LABELS,
  INVOICE_GROUP_TYPE_OPTIONS,
  type EquipmentPricingMode,
} from "@/lib/invoice-group-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimePicker, DateTimeRangePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";
import { MultiSelectFilter } from "@/components/inventory/multi-select-filter";
import { VenuePicker } from "@/components/venues/venue-picker";
import { VenueDetailsButton } from "@/components/venues/venue-details-sheet";
import { useSessionViewer } from "@/components/session-shell-provider";
import { EventBandPaymentSection } from "@/components/events/event-band-payment-section";
import { EventBandRidersSection } from "@/components/events/event-band-riders-section";
import { EventMediaSection } from "@/components/events/event-media-section";
import { CommentsSection } from "@/components/comments/comments-section";
import { EventPullList, mapPullListRow, type PullListItemDraft } from "@/components/events/event-pull-list";
import { LinkedEventDaySwitcher } from "@/components/events/linked-event-day-switcher";
import { EventTimelineScheduler, type TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { EventScheduleCrewAssignPanel } from "@/components/events/event-availability-summary";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { buildUserSelectDescription } from "@/lib/user-select-description";
import { authClient } from "@/lib/auth-client";
import {
  EVENT_STATUS_EDITOR_OPTIONS,
  normalizeEventStatus,
  type EventStatus,
} from "@/lib/event-status";
import {
  DEFAULT_EVENT_VISIBILITY,
  EVENT_VISIBILITY_OPTIONS,
  normalizeEventVisibility,
  type EventVisibility,
} from "@/lib/event-visibility";
import {
  buildQuickAddScheduleBlocks,
  eventTypeHasCrewAssignment,
  sortScheduleBlocksByTime,
} from "@/lib/event-schedule-draft";
import {
  getAvailabilityNotesForDisplay,
  localDateTimeInputToMs,
  requireLocalDateTimeInputMs,
  toLocalDateTimeInput,
} from "@/lib/crew-availability";
import {
  EVENT_EDITOR_TAB_LABELS,
  EVENT_EDITOR_TABS,
  getEventEditorTabPath,
  type EventEditorTabId,
} from "@/lib/event-editor-tabs";
import {
  computeOccurrenceStarts,
  formatOccurrencePreview,
  SERIES_EDIT_SCOPE_LABELS,
  type RecurrenceEndMode,
  type SeriesEditScope,
} from "@/lib/event-series";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useAppDialog } from "@/components/ui/app-dialog";
import { notify } from "@/lib/notify";
import { FormSaveBar } from "@/components/forms";
import { StoredAssetImage, StoredAssetLink } from "@/components/files/stored-asset-image";
import { isImageAssetReference } from "@/lib/r2-assets";
import {
  formatDateTime,
  formatUsd,
  payPeriodForDate,
  pacificEndOfDayMs,
  pacificScheduleDayCount,
} from "@/lib/format";
import {
  arborEarnedRevenueUsd,
  eventPassThroughCostUsd,
  invoicePassThroughUsd,
  netProfitCostUsd,
  netProfitFromInvoiceUsd,
} from "@/lib/invoice-profit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { WarningCircleIcon } from "@phosphor-icons/react";

function EventArtifactAttachment({
  linkUrl,
  fileUrl,
}: {
  linkUrl?: string;
  fileUrl?: string;
}) {
  const storedValue = linkUrl ?? fileUrl;
  if (!storedValue?.trim()) return null;

  if (isImageAssetReference(storedValue)) {
    return (
      <StoredAssetImage
        storedValue={storedValue}
        className="max-h-40 rounded-md border object-contain"
      />
    );
  }

  return (
    <StoredAssetLink storedValue={storedValue} className="text-xs text-primary hover:underline">
      View attachment
    </StoredAssetLink>
  );
}

type EventType = "Crewed Event" | "Rental with Crew" | "Dry Hire" | "Services Only";
type StoredEventType = EventType | "Dry Rental";
type RentalFulfillmentMode = "delivery" | "will_call";
type EventTeam = "Design" | "Marketing" | "Lighting" | "Sound" | "Operations";
type ShiftDraft = {
  id?: Id<"eventCrewShifts">;
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  scheduleBlockRef?: string;
  expenseReportId?: Id<"eventExpenseReports">;
  role: string;
  userId?: string;
  crewApplicationId?: Id<"crewApplications">;
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

function formatHours(value: number) {
  return `${value.toFixed(2)}h`;
}

const RENTAL_EVENT_TYPES: EventType[] = ["Dry Hire", "Rental with Crew"];
const FULFILLMENT_OPTIONS: SearchableSelectOption[] = [
  { value: "delivery", label: "Delivery" },
  { value: "will_call", label: "Will-call" },
];

function normalizeFulfillmentMode(
  value: RentalFulfillmentMode | "pickup" | "" | undefined,
): RentalFulfillmentMode {
  if (value === "pickup" || value === "delivery") return "delivery";
  return value === "will_call" ? "will_call" : "delivery";
}

function normalizeEventType(value: StoredEventType | undefined): EventType {
  if (value === "Dry Rental") return "Dry Hire";
  return value ?? "Crewed Event";
}

export function EventEditor({
  eventId,
  activeTab = "overview",
}: {
  eventId?: Id<"events">;
  activeTab?: EventEditorTabId;
}) {
  const router = useRouter();
  const { confirm, alert } = useAppDialog();
  const session = authClient.useSession();
  const isCreate = !eventId;
  const loadOverviewLookups = isCreate || activeTab === "overview";
  const eventDetail = activeTab === "schedule" ? "schedule" : "full";
  const eventData = useQuery(
    api.events.get,
    eventId ? { id: eventId, detail: eventDetail } : "skip",
  );
  const viewer = useSessionViewer();
  // Billing/host lookups are overview-only — schedule/equipment tabs were fan-out
  // saturating local Convex (and slowing prod) for fields they never render.
  const invoices = useQuery(api.invoices.list, loadOverviewLookups ? {} : "skip");
  const hostGroups = useQuery(
    api.invoiceGroups.list,
    loadOverviewLookups ? { activeOnly: true } : "skip",
  );
  const managerList = useQuery(api.invoices.listManagers, loadOverviewLookups ? {} : "skip");
  const posterAssignment = useQuery(
    api.marketingDesigns.getPosterAssignmentForEvent,
    eventId && activeTab === "overview" ? { eventId } : "skip",
  );
  const createEvent = useMutation(api.events.create);
  const createEventSeries = useMutation(api.eventSeries.create);
  const reattachOccurrence = useMutation(api.eventSeries.reattachOccurrence);
  const createHostGroup = useMutation(api.invoiceGroups.create);
  const updateEvent = useMutation(api.events.update);
  const setEventStatus = useMutation(api.events.setStatus);
  const deleteEventAdmin = useMutation(api.events.deleteEvent);
  const upsertBlocks = useMutation(api.eventSchedule.upsertBlocks);
  const upsertShifts = useMutation(api.eventCrew.upsertShifts);
  const deleteUnassignedShifts = useMutation(api.eventCrew.deleteUnassignedShifts);
  const createArtifact = useMutation(api.eventArtifacts.create);
  const assignPosterDesigner = useMutation(api.marketingDesigns.assignPosterDesigner);
  const copyDaySetup = useMutation(api.events.copyDaySetup);

  const siblingDays = useQuery(
    api.events.listSiblingDays,
    eventId ? { eventId } : "skip",
  );
  const [copyingDaySetup, setCopyingDaySetup] = useState(false);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<EventStatus>("tentative");
  const [visibility, setVisibility] = useState<EventVisibility>(DEFAULT_EVENT_VISIBILITY);
  const [invoiceId, setInvoiceId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [venueId, setVenueId] = useState("");
  const [eventType, setEventType] = useState<EventType>("Crewed Event");
  const [rentalFulfillmentMode, setRentalFulfillmentMode] = useState<RentalFulfillmentMode>("delivery");
  const [teamsInterested, setTeamsInterested] = useState<EventTeam[]>([]);
  const [hostGroupId, setHostGroupId] = useState("");
  const [additionalHostGroupIds, setAdditionalHostGroupIds] = useState<string[]>([]);
  const [hostGroupModalOpen, setHostGroupModalOpen] = useState(false);
  const [newHostName, setNewHostName] = useState("");
  const [newHostType, setNewHostType] = useState<"vso" | "house" | "department" | "individual">(
    "department",
  );
  const [newHostEquipmentPricingMode, setNewHostEquipmentPricingMode] =
    useState<EquipmentPricingMode>("subsidized");
  const [creatingHost, setCreatingHost] = useState(false);
  const hostNameSuggestion = useQuery(
    api.invoiceGroups.suggestByName,
    hostGroupModalOpen && newHostName.trim().length >= 2
      ? { name: newHostName.trim() }
      : "skip",
  );
  // Expenses (and overview approval hints) need the linked invoice even when the
  // overview list query is skipped — or when the invoice falls outside the recent list.
  const linkedInvoiceIdForLookup = (invoiceId || eventData?.event.invoiceId) as
    | Id<"invoices">
    | undefined;
  const loadLinkedInvoice =
    Boolean(linkedInvoiceIdForLookup) &&
    (isCreate || activeTab === "overview" || activeTab === "expenses");
  const linkedInvoiceDetail = useQuery(
    api.invoices.get,
    loadLinkedInvoice && linkedInvoiceIdForLookup
      ? { id: linkedInvoiceIdForLookup }
      : "skip",
  );
  const [managerUserId, setManagerUserId] = useState("");
  const [dayOfLeadUserId, setDayOfLeadUserId] = useState("");
  const [crewCostUsd, setCrewCostUsd] = useState("0");
  const [bandsCostUsd, setBandsCostUsd] = useState("0");
  const [externalRentalsCostUsd, setExternalRentalsCostUsd] = useState("0");
  const [otherCostUsd, setOtherCostUsd] = useState("0");
  const [otPremium, setOtPremium] = useState(false);
  const [crewCostBufferPercent, setCrewCostBufferPercent] = useState("");
  const [notes, setNotes] = useState("");
  const [openMicEnabled, setOpenMicEnabled] = useState(false);
  const [openMicNotes, setOpenMicNotes] = useState("");
  const [blocks, setBlocks] = useState<TimelineBlockDraft[]>([]);
  const [shifts, setShifts] = useState<ShiftDraft[]>([]);
  const [selectedCrewUserId, setSelectedCrewUserId] = useState("");
  const [artifactType, setArtifactType] = useState<"note" | "instruction" | "document" | "pull_list">("note");
  const [artifactTitle, setArtifactTitle] = useState("");
  const [artifactMarkdown, setArtifactMarkdown] = useState("");
  const [artifactLinkUrl, setArtifactLinkUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  function flash(tone: "success" | "error", text: string) {
    setMessageTone(tone);
    setMessage(text);
    if (tone === "success") notify.success(text);
    else notify.error(text);
  }
  const [isRecurring, setIsRecurring] = useState(false);
  const [intervalWeeks, setIntervalWeeks] = useState("1");
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<RecurrenceEndMode>("count");
  const [occurrenceCount, setOccurrenceCount] = useState("10");
  const [seriesEndAt, setSeriesEndAt] = useState("");
  const [editScopeModalOpen, setEditScopeModalOpen] = useState(false);
  const hydratedEventIdRef = useRef<string | null>(null);
  const [lastSavedOverviewSignature, setLastSavedOverviewSignature] = useState("");
  const [lastSavedScheduleSignature, setLastSavedScheduleSignature] = useState("");
  const localBlockCounterRef = useRef(0);
  const createDefaultsAppliedRef = useRef(false);

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

  /**
   * Crew shift times mirror their schedule block's window (the backend
   * force-syncs this on every schedule save). Sync draft shift times whenever
   * blocks change so the UI already reflects what a save will persist.
   */
  function syncShiftsToBlockTimes(nextShifts: ShiftDraft[], nextBlocks: TimelineBlockDraft[]): ShiftDraft[] {
    return nextShifts.map((shift) => {
      const block = nextBlocks.find((candidate) => getBlockRef(candidate) === shift.scheduleBlockRef);
      if (!block) return shift;
      if (shift.startsAt === block.startsAt && shift.endsAt === block.endsAt) return shift;
      return { ...shift, startsAt: block.startsAt, endsAt: block.endsAt };
    });
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
    if (!isCreate || createDefaultsAppliedRef.current) return;
    createDefaultsAppliedRef.current = true;
    if (typeof window === "undefined") return;
    const dateParam = new URLSearchParams(window.location.search).get("date")?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    // Default show window for board "+" : 6pm–10pm Pacific wall clock.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time create-mode default, guarded by createDefaultsAppliedRef
    setStartAt(`${dateParam}T18:00`);
    setEndAt(`${dateParam}T22:00`);
  }, [isCreate]);

  useEffect(() => {
    if (!eventData?.event) return;
    if (hydratedEventIdRef.current === eventData.event._id) return;
    // Host groups load only on overview. Schedule/other tabs must still hydrate
    // blocks/shifts — do not wait forever on a skipped query (undefined).
    if (loadOverviewLookups && hostGroups === undefined) return;
    hydratedEventIdRef.current = eventData.event._id;
    // One-time hydration per loaded event id (guarded by hydratedEventIdRef above) so
    // in-progress edits are never overwritten by a later re-run of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration per event id, see hydratedEventIdRef guard
    setTitle(eventData.event.title);
    setStatus(normalizeEventStatus(eventData.event.status));
    setVisibility(normalizeEventVisibility(eventData.event.visibility));
    setInvoiceId(eventData.event.invoiceId ?? "");
    setStartAt(toLocalDateTimeInput(eventData.event.startAt));
    setEndAt(toLocalDateTimeInput(eventData.event.endAt));
    setVenueId(eventData.event.venueId ?? "");
    setEventType(normalizeEventType(eventData.event.eventType as StoredEventType | undefined));
    setRentalFulfillmentMode(
      normalizeFulfillmentMode(
        eventData.event.rentalFulfillmentMode as RentalFulfillmentMode | "pickup" | undefined,
      ),
    );
    setTeamsInterested((eventData.event.teamsInterested as EventTeam[] | undefined) ?? []);
    const linkedHostGroupId =
      eventData.event.hostGroupId ??
      hostGroups?.find(
        (group) =>
          eventData.event.host &&
          group.name.trim().toLowerCase() === eventData.event.host.trim().toLowerCase(),
      )?._id ??
      "";
    setHostGroupId(linkedHostGroupId);
    setAdditionalHostGroupIds(
      (eventData.event.additionalHostGroupIds ?? []).map((id) => String(id)),
    );
    setManagerUserId(eventData.event.eventManagerUserId ?? "");
    setDayOfLeadUserId(eventData.event.dayOfLeadUserId ?? "");
    setCrewCostUsd((eventData.event.crewCostUsd ?? 0).toString());
    setBandsCostUsd((eventData.event.bandsCostUsd ?? 0).toString());
    setExternalRentalsCostUsd((eventData.event.externalRentalsCostUsd ?? 0).toString());
    setOtherCostUsd((eventData.event.otherCostUsd ?? 0).toString());
    setOtPremium(eventData.event.otPremium === true);
    setCrewCostBufferPercent(
      eventData.event.crewCostBufferPercent !== undefined
        ? String(eventData.event.crewCostBufferPercent)
        : "",
    );
    setNotes(eventData.event.notes ?? "");
    setOpenMicEnabled(eventData.event.openMicEnabled === true);
    setOpenMicNotes(eventData.event.openMicNotes ?? "");
    setBlocks(
      sortScheduleBlocksByTime(
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
      ),
    );
    setShifts(
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
      })),
    );
    const hydratedTeams = (eventData.event.teamsInterested as EventTeam[] | undefined) ?? [];
    const hydratedEventType = normalizeEventType(eventData.event.eventType as StoredEventType | undefined);
    const hydratedFulfillment = normalizeFulfillmentMode(
      eventData.event.rentalFulfillmentMode as RentalFulfillmentMode | "pickup" | undefined,
    );
    const rentalTypes = ["Dry Hire", "Rental with Crew"] as EventType[];
    setLastSavedOverviewSignature(JSON.stringify({
      title: eventData.event.title.trim(),
      status: normalizeEventStatus(eventData.event.status),
      visibility: normalizeEventVisibility(eventData.event.visibility),
      invoiceId: eventData.event.invoiceId ?? undefined,
      startAt: eventData.event.startAt,
      endAt: eventData.event.endAt,
      venueId: eventData.event.venueId || undefined,
      eventType: hydratedEventType || undefined,
      rentalFulfillmentMode: rentalTypes.includes(hydratedEventType) ? hydratedFulfillment : undefined,
      teamsInterested: hydratedTeams.length > 0 ? hydratedTeams : undefined,
      hostGroupId: eventData.event.hostGroupId || undefined,
      eventManagerUserId: eventData.event.eventManagerUserId || undefined,
      dayOfLeadUserId: eventData.event.dayOfLeadUserId || undefined,
      bandsCostUsd: Number(eventData.event.bandsCostUsd ?? 0),
      externalRentalsCostUsd: Number(eventData.event.externalRentalsCostUsd ?? 0),
      otherCostUsd: Number(eventData.event.otherCostUsd ?? 0),
      notes: eventData.event.notes || undefined,
      openMicEnabled: eventData.event.openMicEnabled === true,
      openMicNotes: eventData.event.openMicNotes || undefined,
    }));
    const hydratedBlocks = eventData.blocks.map((row) => ({
      id: row._id,
      clientId: row._id,
      blockType: row.blockType,
      label: row.label,
      dayIndex: row.dayIndex,
      startsAt: toLocalDateTimeInput(row.startsAt),
      endsAt: toLocalDateTimeInput(row.endsAt),
      notes: row.notes ?? "",
    }));
    const hydratedShifts = eventData.shifts.map((row) => ({
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
    }));
    setLastSavedScheduleSignature(
      JSON.stringify({
        blocks: hydratedBlocks,
        shifts: hydratedShifts,
      }),
    );
  }, [eventData, hostGroups, loadOverviewLookups]);

  const hideSchedule = eventType === "Services Only";
  const hideEquipment = eventType === "Services Only";
  const showFulfillmentPicker = RENTAL_EVENT_TYPES.includes(eventType);
  const visibleTabs = useMemo(
    () =>
      EVENT_EDITOR_TABS.filter((tab) => {
        if (hideSchedule && tab === "schedule") return false;
        if (hideEquipment && tab === "equipment") return false;
        return true;
      }),
    [hideSchedule, hideEquipment],
  );

  const resolvedActiveTab: EventEditorTabId = visibleTabs.includes(activeTab) ? activeTab : "overview";

  useEffect(() => {
    if (visibleTabs.includes(activeTab)) return;
    router.replace(getEventEditorTabPath(eventId, "overview"));
  }, [activeTab, visibleTabs, eventId, router]);

  const dayCount = useMemo(() => {
    if (!startAt) return 1;
    const startMs = localDateTimeInputToMs(startAt);
    if (startMs == null) return 1;
    // Day rows follow the schedule span from event start through the latest of
    // event end and any block times — so 11pm show end + 1am strike gets Day 2
    // without forcing events.endAt past midnight.
    let latestMs = localDateTimeInputToMs(endAt) ?? startMs;
    for (const block of blocks) {
      const blockStart = localDateTimeInputToMs(block.startsAt);
      const blockEnd = localDateTimeInputToMs(block.endsAt);
      if (blockStart != null) latestMs = Math.max(latestMs, blockStart);
      if (blockEnd != null) latestMs = Math.max(latestMs, blockEnd);
    }
    if (latestMs < startMs) latestMs = startMs;
    return pacificScheduleDayCount(startMs, latestMs);
  }, [startAt, endAt, blocks]);

  const statusOptions: SearchableSelectOption[] = useMemo(
    () =>
      EVENT_STATUS_EDITOR_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [],
  );
  const visibilityOptions: SearchableSelectOption[] = useMemo(
    () =>
      EVENT_VISIBILITY_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
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

  const hostGroupOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: "", label: "No host" },
      ...((hostGroups ?? []).map((group) => ({
        value: group._id,
        label: group.name,
        description: INVOICE_GROUP_TYPE_LABELS[group.type] ?? group.type,
        keywords: group.type,
      })) satisfies SearchableSelectOption[]),
    ],
    [hostGroups],
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
      description: buildUserSelectDescription(entry),
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
  const canAssignPosterDesigner = Boolean(
    viewer?.isAdmin ||
      viewer?.verticals.includes("Marketing") ||
      viewer?.verticals.includes("Operations"),
  );

  const recurrencePreview = useMemo(() => {
    if (!isCreate || !isRecurring || !startAt) return { starts: [] as number[], error: null as string | null };
    try {
      const anchorStartAt = localDateTimeInputToMs(startAt);
      if (anchorStartAt == null) {
        return { starts: [] as number[], error: "Invalid start time." };
      }
      const parsedInterval = Number(intervalWeeks);
      if (!Number.isFinite(parsedInterval) || parsedInterval < 1) {
        return { starts: [] as number[], error: "Interval must be at least 1 week." };
      }
      const seriesEndMs =
        recurrenceEndMode === "date" && seriesEndAt
          ? (() => {
              const [year, month, day] = seriesEndAt.split("-").map(Number);
              if (![year, month, day].every((n) => Number.isFinite(n))) return undefined;
              return pacificEndOfDayMs(year, month, day);
            })()
          : undefined;
      const starts = computeOccurrenceStarts({
        anchorStartAt,
        intervalWeeks: parsedInterval,
        occurrenceCount:
          recurrenceEndMode === "count" ? Number(occurrenceCount || "0") : undefined,
        seriesEndAt: seriesEndMs,
      });
      return { starts, error: null };
    } catch (error) {
      return {
        starts: [] as number[],
        error: error instanceof Error ? error.message : "Invalid recurrence settings.",
      };
    }
  }, [isCreate, isRecurring, startAt, intervalWeeks, recurrenceEndMode, occurrenceCount, seriesEndAt]);

  const seriesMeta = eventData?.series ?? null;

  const isAdmin = viewer?.isAdmin ?? false;
  const canEdit = isCreate || (eventData?.canEdit ?? false);
  const readOnly = !canEdit && !isCreate;

  function openCreateHost(prefill: string) {
    setNewHostName(prefill);
    setNewHostType("department");
    setNewHostEquipmentPricingMode("subsidized");
    setHostGroupModalOpen(true);
  }

  async function submitCreateHost() {
    if (!newHostName.trim() || creatingHost) return;
    if (hostNameSuggestion && hostNameSuggestion.matchKind !== "similar") {
      setHostGroupId(hostNameSuggestion._id);
      setHostGroupModalOpen(false);
      setNewHostName("");
      return;
    }
    setCreatingHost(true);
    try {
      const id = await createHostGroup({
        name: newHostName.trim(),
        type: newHostType,
        equipmentPricingMode: newHostEquipmentPricingMode,
        active: true,
      });
      setHostGroupId(id);
      setHostGroupModalOpen(false);
      setNewHostName("");
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Failed to create host."));
    } finally {
      setCreatingHost(false);
    }
  }

  function buildOverviewPayload() {
    const startAtMs = localDateTimeInputToMs(startAt);
    const endAtMs = localDateTimeInputToMs(endAt);
    const base = {
      title: title.trim(),
      status,
      visibility,
      invoiceId: invoiceId ? (invoiceId as Id<"invoices">) : undefined,
      startAt: startAtMs ?? Number.NaN,
      endAt: endAtMs ?? Number.NaN,
      venueId: venueId ? (venueId as Id<"venues">) : null,
      eventType: eventType || undefined,
      rentalFulfillmentMode: showFulfillmentPicker ? rentalFulfillmentMode : undefined,
      teamsInterested: teamsInterested.length > 0 ? teamsInterested : undefined,
      ...(invoiceId
        ? {}
        : { hostGroupId: hostGroupId ? (hostGroupId as Id<"invoiceGroups">) : null }),
      additionalHostGroupIds: additionalHostGroupIds
        .filter((id) => id && id !== effectivePrimaryHostGroupId)
        .map((id) => id as Id<"invoiceGroups">),
      eventManagerUserId: managerUserId || undefined,
      dayOfLeadUserId: dayOfLeadUserId || undefined,
      bandsCostUsd: Number(bandsCostUsd || "0"),
      externalRentalsCostUsd: Number(externalRentalsCostUsd || "0"),
      otherCostUsd: Number(otherCostUsd || "0"),
      notes: notes || undefined,
    };
    if (!isAdmin) return base;
    return {
      ...base,
      otPremium: otPremium || undefined,
      crewCostBufferPercent:
        crewCostBufferPercent.trim() === ""
          ? undefined
          : Number(crewCostBufferPercent || "0"),
      openMicEnabled,
      openMicNotes: openMicNotes || undefined,
    };
  }

  async function persistOverview(editScope?: SeriesEditScope) {
    const payload = buildOverviewPayload();
    if (!Number.isFinite(payload.startAt) || !Number.isFinite(payload.endAt)) {
      throw new Error("Start and end times are required.");
    }
    if (isCreate) {
      if (isRecurring) {
        const parsedInterval = Number(intervalWeeks);
        if (!Number.isFinite(parsedInterval) || parsedInterval < 1) {
          throw new Error("Interval must be at least 1 week.");
        }
        const result = await createEventSeries({
          title: payload.title,
          startAt: payload.startAt,
          endAt: payload.endAt,
          intervalWeeks: parsedInterval,
          occurrenceCount:
            recurrenceEndMode === "count" ? Number(occurrenceCount || "0") : undefined,
          seriesEndAt:
            recurrenceEndMode === "date" && seriesEndAt
              ? (() => {
                  const [year, month, day] = seriesEndAt.split("-").map(Number);
                  if (![year, month, day].every((n) => Number.isFinite(n))) {
                    throw new Error("Invalid series end date.");
                  }
                  return pacificEndOfDayMs(year, month, day);
                })()
              : undefined,
          venueId: payload.venueId ?? undefined,
          eventType: payload.eventType,
          rentalFulfillmentMode: payload.rentalFulfillmentMode,
          teamsInterested: payload.teamsInterested,
          hostGroupId: payload.hostGroupId ?? undefined,
          additionalHostGroupIds: payload.additionalHostGroupIds,
          eventManagerUserId: payload.eventManagerUserId,
          dayOfLeadUserId: payload.dayOfLeadUserId,
          notes: payload.notes,
          invoiceId: payload.invoiceId,
        });
        router.replace(getEventEditorTabPath(String(result.firstEventId), resolvedActiveTab));
        return;
      }
      const id = await createEvent({
        ...payload,
        venueId: payload.venueId ?? undefined,
        hostGroupId: payload.hostGroupId ?? undefined,
        visibility,
      });
      router.replace(getEventEditorTabPath(String(id), resolvedActiveTab));
      return;
    }
    await updateEvent({
      id: eventId!,
      ...payload,
      editScope: seriesMeta && editScope ? editScope : undefined,
    });
    setLastSavedOverviewSignature(JSON.stringify(payload));
    flash("success", "Overview saved.");
  }

  async function saveCore() {
    if (!title.trim() || !startAt || !endAt) {
      flash("error", "Title, start, and end are required.");
      return;
    }
    if (isCreate && isRecurring) {
      if (recurrencePreview.error) {
        flash("error", recurrencePreview.error);
        return;
      }
      if (recurrencePreview.starts.length === 0) {
        flash("error", "Add valid recurrence settings to preview at least one occurrence.");
        return;
      }
    }
    try {
      if (!isCreate && seriesMeta && !seriesMeta.seriesDetached) {
        setEditScopeModalOpen(true);
        return;
      }
      await persistOverview("this");
    } catch (error) {
      flash("error", `Overview error: ${getConvexErrorMessage(error)}`);
    }
  }

  async function confirmEditScope(scope: SeriesEditScope) {
    setEditScopeModalOpen(false);
    try {
      await persistOverview(scope);
    } catch (error) {
      flash("error", `Overview error: ${getConvexErrorMessage(error)}`);
    }
  }

  async function saveSchedule() {
    if (!eventId) return;
    try {
      const blocksWithRefs = withStableBlockRefs(
        blocks.map((row) => ({
          ...row,
          dayIndex: Math.max(0, row.dayIndex),
        })),
      );
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
      setBlocks(
        sortScheduleBlocksByTime(
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
        ),
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
      const nextShifts = shifts.map((shift) => {
        const persistedId =
          shift.scheduleBlockId ??
          (shift.scheduleBlockRef ? persistedBlockIdByRef.get(shift.scheduleBlockRef) : undefined);
        return {
          ...shift,
          scheduleBlockId: persistedId,
          scheduleBlockRef: shift.scheduleBlockRef ?? persistedId,
        };
      });
      setShifts(nextShifts);
      setLastSavedScheduleSignature(
        JSON.stringify({
          blocks: savedBlocks.map((row) => ({
            id: row.id,
            clientId: row.clientId ?? row.id,
            blockType: row.blockType,
            label: row.label,
            dayIndex: row.dayIndex,
            startsAt: toLocalDateTimeInput(row.startsAt),
            endsAt: toLocalDateTimeInput(row.endsAt),
            notes: row.notes ?? "",
          })),
          shifts: nextShifts,
        }),
      );
    } catch (error) {
      flash("error", `Schedule error: ${getConvexErrorMessage(error)}`);
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
          crewApplicationId: row.crewApplicationId,
          personName: row.personName || undefined,
          startsAt: requireLocalDateTimeInputMs(row.startsAt, "block start"),
          endsAt: requireLocalDateTimeInputMs(row.endsAt, "block end"),
          postedToExpense: row.expenseReportId ? row.postedToExpense : false,
          notes: row.notes || undefined,
        })),
      });
      setLastSavedScheduleSignature(JSON.stringify({ blocks, shifts }));
    } catch (error) {
      flash("error", `Schedule personnel error: ${getConvexErrorMessage(error)}`);
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
      flash("success", "Schedule and assigned personnel saved.");
    } catch {
      // Individual save handlers already set section-specific messages.
    }
  }

  async function deleteEventPermanently() {
    if (!eventId) return;
    const shouldDelete = await confirm({
      title: "Permanently delete this cancelled event?",
      description: "This removes all of its schedule, crew, and pull-list data. This cannot be undone.",
      destructive: true,
    });
    if (!shouldDelete) return;
    try {
      await deleteEventAdmin({ id: eventId });
      router.push("/dashboard/events");
    } catch (error) {
      flash("error", getConvexErrorMessage(error));
    }
  }

  async function cancelAndDeleteEvent() {
    if (!eventId) return;
    const shouldDelete = await confirm({
      title: "Cancel and delete this event?",
      description: "This permanently deletes the event, including all schedule, crew, and pull-list data. This cannot be undone.",
      destructive: true,
    });
    if (!shouldDelete) return;
    try {
      if (normalizeEventStatus(eventData?.event.status) !== "cancelled") {
        await setEventStatus({ id: eventId, status: "cancelled" });
      }
      await deleteEventAdmin({ id: eventId });
      router.push("/dashboard/events");
    } catch (error) {
      flash("error", getConvexErrorMessage(error));
    }
  }

  async function removeLegacyUnassignedShifts() {
    if (!eventId) return;
    const shouldDelete = await confirm({
      title: "Delete unassigned legacy shifts?",
      description: "Delete all legacy shifts that are not assigned to any schedule block?",
      destructive: true,
    });
    if (!shouldDelete) return;
    try {
      const result = await deleteUnassignedShifts({ eventId });
      setShifts((prev) => prev.filter((shift) => shift.scheduleBlockRef));
      flash("success", `Deleted ${result.deletedCount} legacy unassigned shift${result.deletedCount === 1 ? "" : "s"}.`);
    } catch (error) {
      flash("error", getConvexErrorMessage(error));
    }
  }

  async function resetToSeries() {
    if (!eventId || readOnly) return;
    const shouldReset = await confirm({
      title: "Reset this occurrence to the series template?",
      description: "This restores overview fields, times, schedule blocks, and unassigned crew shifts, and clears the detached state. Assigned crew shifts are kept.",
      confirmLabel: "Reset",
    });
    if (!shouldReset) return;
    try {
      await reattachOccurrence({ eventId });
      // Allow the load effect to re-hydrate local form state from the restored occurrence.
      hydratedEventIdRef.current = null;
      flash("success", "Occurrence reset to series template.");
    } catch (error) {
      flash("error", getConvexErrorMessage(error, "Failed to reset occurrence."));
    }
  }

  const currentEventId = eventId ?? eventData?.event?._id;
  const [nowMs] = useState(() => Date.now());
  const payPeriod = useMemo(() => payPeriodForDate(nowMs), [nowMs]);
  const otForecast = useQuery(
    api.eventCrew.getOtForecastForUser,
    selectedCrewUserId && canEdit
      ? {
          userId: selectedCrewUserId,
          rangeStart: payPeriod.startMs,
          rangeEnd: payPeriod.endMs,
        }
      : "skip",
  );
  const computedCrewCost = useQuery(
    api.eventCrew.getComputedCrewCost,
    currentEventId && activeTab === "expenses" ? { eventId: currentEventId } : "skip",
  );
  const availabilitySummary = useQuery(
    api.eventCrewAvailability.getSummaryForEvent,
    currentEventId &&
      activeTab === "schedule" &&
      eventTypeHasCrewAssignment(eventType)
      ? { eventId: currentEventId }
      : "skip",
  );
  const availabilityByUserId = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof availabilitySummary>["assignableResponders"][number]
    >();
    for (const responder of availabilitySummary?.assignableResponders ?? []) {
      map.set(responder.userId, responder);
    }
    return map;
  }, [availabilitySummary]);
  const linkedInvoice = useMemo(() => {
    if (linkedInvoiceDetail?.invoice) return linkedInvoiceDetail.invoice;
    if (!invoiceId) return null;
    return (invoices ?? []).find((row) => row._id === invoiceId) ?? null;
  }, [linkedInvoiceDetail, invoiceId, invoices]);
  const invoicePrimaryHostGroupId = linkedInvoice?.groupId ? String(linkedInvoice.groupId) : "";
  const invoicePrimaryHostName =
    linkedInvoice?.clientGroupName ??
    hostGroupOptions.find((option) => option.value === invoicePrimaryHostGroupId)?.label ??
    "";
  const effectivePrimaryHostGroupId = invoiceId ? invoicePrimaryHostGroupId : hostGroupId;

  useEffect(() => {
    if (!invoiceId || !invoicePrimaryHostGroupId) return;
    setHostGroupId(invoicePrimaryHostGroupId);
    setAdditionalHostGroupIds((prev) => prev.filter((id) => id !== invoicePrimaryHostGroupId));
  }, [invoiceId, invoicePrimaryHostGroupId]);
  const crewCostTotal = computedCrewCost?.totalCostUsd ?? Number(crewCostUsd || "0");
  const bandsCostTotal = Number(bandsCostUsd || "0");
  const externalRentalsCostTotal = Number(externalRentalsCostUsd || "0");
  const otherCostTotal = Number(otherCostUsd || "0");
  const seriesRecurringTotalUsd =
    (seriesMeta?.seriesBandsCostUsd ?? 0) +
    (seriesMeta?.seriesExternalRentalsCostUsd ?? 0) +
    (seriesMeta?.seriesOtherCostUsd ?? 0);
  const totalEventCostUsd = crewCostTotal + bandsCostTotal + externalRentalsCostTotal + otherCostTotal;
  const seriesProjectedCostUsd = seriesMeta?.costSummary?.projectedGrandTotalUsd;
  const marginEventCostUsd =
    seriesMeta && seriesProjectedCostUsd !== undefined
      ? seriesProjectedCostUsd
      : totalEventCostUsd + seriesRecurringTotalUsd;
  const eventPassThroughCostsUsd =
    seriesMeta?.costSummary?.projectedPassThroughUsd !== undefined
      ? seriesMeta.costSummary.projectedPassThroughUsd
      : eventPassThroughCostUsd(bandsCostTotal, externalRentalsCostTotal) +
        (seriesMeta?.seriesBandsCostUsd ?? 0) +
        (seriesMeta?.seriesExternalRentalsCostUsd ?? 0);
  const invoicePassThroughSubtotalUsd = invoicePassThroughUsd(
    linkedInvoice?.artistsSubtotalUsd ?? 0,
    linkedInvoice?.externalRentalsSubtotalUsd ?? 0,
  );
  const billedTotalUsd =
    linkedInvoice != null
      ? arborEarnedRevenueUsd(linkedInvoice.totalUsd, invoicePassThroughSubtotalUsd)
      : null;
  const marginCostUsd =
    linkedInvoice != null
      ? netProfitCostUsd(
          marginEventCostUsd,
          invoicePassThroughSubtotalUsd,
          eventPassThroughCostsUsd,
        )
      : marginEventCostUsd;
  const profitLossUsd =
    linkedInvoice != null
      ? netProfitFromInvoiceUsd(
          linkedInvoice.totalUsd,
          invoicePassThroughSubtotalUsd,
          marginEventCostUsd,
          eventPassThroughCostsUsd,
        )
      : null;
  const quickAddDisabled = !startAt || !endAt;
  const quickAddDisabledReason = quickAddDisabled ? "Set event start and end first." : undefined;
  const quickAddLabel =
    eventType === "Dry Hire"
      ? rentalFulfillmentMode === "will_call"
        ? "Quick Add: Check-out + Return"
        : "Quick Add: Drop-off + Pickup"
      : eventType === "Rental with Crew"
        ? "Quick Add: Setup + Strike"
        : "Quick Add: Setup + Show + Strike";

  const pullListInitialItems: PullListItemDraft[] = useMemo(
    () => (eventData?.pullListItems ?? []).map((row) => mapPullListRow(row)),
    [eventData?.pullListItems],
  );

  const pullListSyncKey = useMemo(
    () =>
      pullListInitialItems
        .map((row) => `${row.id ?? "new"}:${row.lineKind}:${row.typeId ?? row.packageId}:${row.quantityRequired}`)
        .join("|"),
    [pullListInitialItems],
  );

  const overviewSignature = useMemo(
    () => JSON.stringify(buildOverviewPayload()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildOverviewPayload is recreated each render; deps are its closed-over fields
    [
      title,
      status,
      visibility,
      invoiceId,
      startAt,
      endAt,
      venueId,
      eventType,
      rentalFulfillmentMode,
      teamsInterested,
      hostGroupId,
      additionalHostGroupIds,
      managerUserId,
      dayOfLeadUserId,
      bandsCostUsd,
      externalRentalsCostUsd,
      otherCostUsd,
      notes,
      showFulfillmentPicker,
      openMicEnabled,
      openMicNotes,
    ],
  );

  const scheduleSignature = useMemo(
    () => JSON.stringify({ blocks, shifts }),
    [blocks, shifts],
  );

  const hasUnsavedChanges = useMemo(() => {
    if (isCreate) return true;
    if (resolvedActiveTab === "schedule") {
      return scheduleSignature !== lastSavedScheduleSignature;
    }
    return overviewSignature !== lastSavedOverviewSignature;
  }, [
    isCreate,
    resolvedActiveTab,
    overviewSignature,
    scheduleSignature,
    lastSavedOverviewSignature,
    lastSavedScheduleSignature,
  ]);

  const saveTier = resolvedActiveTab === "overview" ? "B" : "C";
  const saveStatus =
    messageTone === "error" ? "error" : message ? "saved" : "idle";

  const handleBarSave = () => {
    if (resolvedActiveTab === "schedule") {
      void saveScheduleAndPersonnel();
      return;
    }
    void saveCore();
  };

  return (
    <div className="space-y-4 pb-20">
      {readOnly ? (
        <Alert>
          <WarningCircleIcon className="size-4" />
          <AlertTitle>Read-only view</AlertTitle>
          <AlertDescription>
            You can view this event but only crew leads and admins can make changes.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{isCreate ? "Create Event" : "Edit Event"}</CardTitle>
          {!isCreate && siblingDays && siblingDays.length > 1 ? (
            <div className="space-y-2 pt-1">
              <LinkedEventDaySwitcher
                days={siblingDays}
                selectedEventId={eventId}
                onSelect={(nextId) => {
                  if (!eventId || nextId === eventId) return;
                  router.push(getEventEditorTabPath(nextId, resolvedActiveTab));
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={readOnly || copyingDaySetup || !eventId}
                  onClick={() => {
                    if (!eventId) return;
                    void (async () => {
                      const confirmed = await confirm({
                        title: "Copy this day's setup to the other linked days?",
                        description:
                          "Copies crew hours (open slots only, not assigned people) and equipment pull/checkout quantities. Existing schedule slots and pull-list rows on those days will be replaced.",
                        confirmLabel: "Copy setup",
                      });
                      if (!confirmed) return;
                      setCopyingDaySetup(true);
                      try {
                        const result = await copyDaySetup({ sourceEventId: eventId });
                        setMessageTone("success");
                        setMessage(
                          `Copied setup to ${result.copiedToEventIds.length} other day${result.copiedToEventIds.length === 1 ? "" : "s"}.`,
                        );
                      } catch (error) {
                        setMessageTone("error");
                        setMessage(getConvexErrorMessage(error));
                      } finally {
                        setCopyingDaySetup(false);
                      }
                    })();
                  }}
                >
                  {copyingDaySetup ? "Copying…" : "Copy setup to other days"}
                </Button>
              </div>
            </div>
          ) : null}
          {seriesMeta ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Recurring · occurrence {(seriesMeta.occurrenceIndex ?? 0) + 1} of {seriesMeta.totalOccurrences}
                {seriesMeta.seriesDetached ? " · detached from series updates" : ""}
                {" · "}
                <Link href={`/dashboard/events/series/${seriesMeta._id}`} className="underline">
                  View series
                </Link>
              </p>
              {seriesMeta.seriesDetached ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={readOnly}
                  onClick={() => void resetToSeries()}
                >
                  Reset to series
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {visibleTabs.map((tab) => (
            <Button
              key={tab}
              asChild
              variant={resolvedActiveTab === tab ? "default" : "outline"}
            >
              <Link href={getEventEditorTabPath(eventId, tab)}>{EVENT_EDITOR_TAB_LABELS[tab]}</Link>
            </Button>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            {isAdmin && eventId ? (
              normalizeEventStatus(eventData?.event.status) === "cancelled" ? (
                <Button type="button" variant="destructive" onClick={() => void deleteEventPermanently()}>
                  Delete Event
                </Button>
              ) : (
                <Button type="button" variant="destructive" onClick={() => void cancelAndDeleteEvent()}>
                  Cancel &amp; Delete
                </Button>
              )
            ) : null}
            <Button type="button" onClick={() => void saveCore()} disabled={readOnly}>
              {isCreate ? (isRecurring ? "Create Series" : "Create Event") : "Save Event"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {resolvedActiveTab === "overview" ? (
        <fieldset disabled={readOnly} className="contents">
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
              {linkedInvoice?.clientApprovalStatus === "approved" && status === "tentative" ? (
                <p className="text-xs text-muted-foreground">
                  Quote is approved — status will move to Logistics when you save.
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Visibility</Label>
              <SearchableSelect
                value={visibility}
                onChange={(value) => setVisibility(value as EventVisibility)}
                options={visibilityOptions}
                placeholder="Search visibility..."
                emptyLabel="Select visibility"
              />
              <p className="text-xs text-muted-foreground">
                Public events appear on the marketing site. Internal and informational entries stay
                staff-only.
              </p>
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
              {invoiceId ? (
                <Button asChild type="button" variant="outline" size="sm" className="mt-2">
                  <Link href={`/dashboard/financial-hub/invoices/${invoiceId}`}>Open Linked Invoice</Link>
                </Button>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Start</Label>
              <DateTimeRangePicker
                startValue={startAt}
                endValue={endAt}
                onChange={({ start, end }) => {
                  setStartAt(start);
                  setEndAt(end);
                }}
                placeholder="Select start and end"
              />
            </div>
            <div className="space-y-1">
              <Label>Venue</Label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <VenuePicker
                    value={venueId}
                    onChange={setVenueId}
                    allowCreate={isAdmin}
                  />
                </div>
                {venueId ? <VenueDetailsButton venueId={venueId} /> : null}
              </div>
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
            {showFulfillmentPicker ? (
              <div className="space-y-1">
                <Label>Fulfillment</Label>
                <SearchableSelect
                  value={rentalFulfillmentMode}
                  onChange={(value) => setRentalFulfillmentMode(value as RentalFulfillmentMode)}
                  options={FULFILLMENT_OPTIONS}
                  placeholder="Search fulfillment..."
                  emptyLabel="Select fulfillment"
                />
              </div>
            ) : null}
            <div className="space-y-3 rounded-md border p-3 md:col-span-3">
              <Label>Hosts</Label>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs font-normal text-muted-foreground">Primary</Label>
                  {invoiceId ? (
                    <div className="space-y-1 text-sm">
                      <p>{invoicePrimaryHostName || "Set a host on the linked invoice."}</p>
                      <Button asChild type="button" variant="link" size="sm" className="h-auto p-0">
                        <Link href={`/dashboard/financial-hub/invoices/${invoiceId}`}>
                          Edit on invoice
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <SearchableSelect
                      value={hostGroupId}
                      onChange={(value) => {
                        setHostGroupId(value);
                        setAdditionalHostGroupIds((prev) => prev.filter((id) => id !== value));
                      }}
                      options={hostGroupOptions}
                      placeholder="Search host organizations…"
                      emptyLabel="No host"
                      onCreate={canEdit || isCreate ? openCreateHost : undefined}
                      createLabel="New Host"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-normal text-muted-foreground">Co-hosts</Label>
                  <MultiSelectFilter
                    label="Co-hosts"
                    hideLabel
                    placeholder="Search co-hosts…"
                    values={additionalHostGroupIds}
                    onChange={setAdditionalHostGroupIds}
                    options={hostGroupOptions.filter(
                      (option) =>
                        option.value !== "" && option.value !== effectivePrimaryHostGroupId,
                    )}
                    emptyLabel="No co-hosts"
                  />
                </div>
              </div>
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
            {!isCreate && canAssignPosterDesigner ? (
              <div className="space-y-1">
                <Label>Marketing poster designer</Label>
                <UserSelect
                  value={posterAssignment?.assigneeUserId ?? ""}
                  onChange={(value) => {
                    if (!eventId) return;
                    void assignPosterDesigner({
                      eventId,
                      assigneeUserId: value || undefined,
                    })
                      .then(() => {
                        flash("success", "Marketing poster designer updated.");
                      })
                      .catch((error) => {
                        flash("error", error instanceof Error ? error.message : "Could not update poster designer.");
                      });
                  }}
                  options={userSelectOptions}
                  emptyLabel="Unassigned"
                  placeholder="Assign marketing designer..."
                />
              </div>
            ) : null}
            <div className="space-y-1 md:col-span-3">
              <Label>Notes</Label>
              <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {currentEventId ? (
              <div className="md:col-span-3">
                <CommentsSection subjectType="event" subjectId={currentEventId} />
              </div>
            ) : null}
            {isCreate ? (
              <div className="space-y-3 md:col-span-3 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(event) => setIsRecurring(event.target.checked)}
                  />
                  Recurring event series
                </label>
                {isRecurring ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Repeat every</Label>
                      <SearchableSelect
                        value={intervalWeeks}
                        onChange={setIntervalWeeks}
                        options={[
                          { value: "1", label: "Weekly" },
                          { value: "2", label: "Every 2 weeks" },
                          { value: "3", label: "Every 3 weeks" },
                          { value: "4", label: "Every 4 weeks" },
                        ]}
                        placeholder="Interval..."
                        emptyLabel="Select interval"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Ends</Label>
                      <SearchableSelect
                        value={recurrenceEndMode}
                        onChange={(value) => setRecurrenceEndMode(value as RecurrenceEndMode)}
                        options={[
                          { value: "count", label: "After N occurrences" },
                          { value: "date", label: "On end date" },
                        ]}
                        placeholder="End mode..."
                        emptyLabel="Select end mode"
                      />
                    </div>
                    {recurrenceEndMode === "count" ? (
                      <div className="space-y-1">
                        <Label>Occurrence count</Label>
                        <Input
                          type="number"
                          min={1}
                          value={occurrenceCount}
                          onChange={(event) => setOccurrenceCount(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">A quarter is typically about 10 weeks.</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label>Series end date</Label>
                        <Input
                          type="date"
                          value={seriesEndAt}
                          onChange={(event) => setSeriesEndAt(event.target.value)}
                        />
                      </div>
                    )}
                    <div className="md:col-span-3 space-y-2">
                      <Label>Preview ({recurrencePreview.starts.length} occurrences)</Label>
                      {recurrencePreview.error ? (
                        <p className="text-sm text-rose-700">{recurrencePreview.error}</p>
                      ) : (
                        <ul className="max-h-40 overflow-y-auto rounded-md border divide-y text-sm">
                          {recurrencePreview.starts.map((occurrenceStart, index) => (
                            <li key={occurrenceStart} className="px-3 py-2">
                              {index + 1}. {formatOccurrencePreview(occurrenceStart)}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Crew scheduling stays separate for each generated occurrence.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
        </fieldset>
      ) : null}

      {resolvedActiveTab === "overview" && eventId ? <EventBandRidersSection eventId={eventId} /> : null}
      {resolvedActiveTab === "overview" && eventId ? <EventBandPaymentSection eventId={eventId} /> : null}

      {resolvedActiveTab === "overview" && isAdmin && eventId ? (
        <Card>
          <CardHeader>
            <CardTitle>Add-ons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={openMicEnabled}
                onChange={(event) => setOpenMicEnabled(event.target.checked)}
              />
              <div className="space-y-1">
                <p className="text-sm font-medium">Open Mic</p>
                <p className="text-xs text-muted-foreground">
                  Adds a first-come, first-served sign-up queue to this event. Strangers sign up
                  from the public Open Mic form and the crew calls them up via the runner.
                </p>
                {openMicEnabled ? (
                  <p className="text-xs text-muted-foreground">
                    Public sign-ups open until 4 hours after the event start. Runner lives at{" "}
                    <Link
                      href={`/dashboard/events/open-mic/${eventId}`}
                      className="underline"
                      target="_blank"
                    >
                      Open Mic runner
                    </Link>
                    .
                  </p>
                ) : null}
              </div>
            </label>
            {openMicEnabled ? (
              <div className="space-y-1">
                <Label>Open Mic notes</Label>
                <textarea
                  className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={openMicNotes}
                  onChange={(event) => setOpenMicNotes(event.target.value)}
                  placeholder="Theme, special instructions, etc."
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {resolvedActiveTab === "schedule" ? (
        <fieldset disabled={readOnly} className="contents">
        <Card>
          <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {seriesMeta ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Crew is scheduled separately for each occurrence in this series.
              </p>
            ) : null}
            {eventId && eventTypeHasCrewAssignment(eventType) ? (
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
                const nextBlocks = withStableBlockRefs(next);
                setBlocks(nextBlocks);
                setShifts((prev) => syncShiftsToBlockTimes(prev, nextBlocks));
              }}
              readOnly={readOnly}
              quickAddLabel={quickAddLabel}
              quickAddDisabled={quickAddDisabled}
              quickAddDisabledReason={quickAddDisabledReason}
              onQuickAdd={() => {
                if (quickAddDisabled || !eventType) return;
                setBlocks(
                  buildQuickAddScheduleBlocks({
                    eventType,
                    startAt,
                    endAt,
                    rentalFulfillmentMode,
                    withStableRefs: withStableBlockRefs,
                  }),
                );
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
              {otForecast?.hasOt || otForecast?.hasDt ? (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-800">
                  OT warning: this crew member may exceed pay-period limits
                  {otForecast.hasDt ? " (including double-time days >12h)" : ""}
                  {otForecast.otWeeks.length > 0 ? " or weekly hours >40" : ""}.
                </p>
              ) : null}
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
                        const availabilityNotes = row.userId
                          ? getAvailabilityNotesForDisplay(availabilityByUserId.get(row.userId), {
                              scheduleBlockId: row.scheduleBlockId,
                            })
                          : [];
                        return (
                          <div
                            key={row.id ?? `${blockRef ?? blockIndex}-shift-${rowIndex}`}
                            className="space-y-1"
                          >
                          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(14rem,2fr)_auto]">
                            <Input
                              placeholder="Role"
                              value={row.role}
                              onChange={(e) =>
                                setShifts((prev) =>
                                  prev.map((shift, i) => (i === shiftIndex ? { ...shift, role: e.target.value } : shift)),
                                )
                              }
                            />
                            {row.crewApplicationId ? (
                              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                                <span className="truncate font-medium">{row.personName || "Trainee"}</span>
                                <span className="ml-1.5 shrink-0 text-xs text-muted-foreground">trainee</span>
                              </div>
                            ) : (
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
                                          }
                                        : shift,
                                    ),
                                  )
                                }
                                options={userSelectOptions}
                                emptyLabel="Select crew user"
                              />
                            )}
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
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setShifts((prev) => prev.filter((_, i) => i !== shiftIndex))}
                            >
                              Remove
                            </Button>
                          </div>
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
                <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-700">
                    <span>
                      Some shifts are not linked to a schedule block (common for trainees assigned as entire event /
                      first 8 hours). They still count as scheduled.
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void removeLegacyUnassignedShifts()}>
                      Delete Unassigned Shifts
                    </Button>
                  </div>
                  {shifts
                    .map((shift, shiftIndex) => ({ shift, shiftIndex }))
                    .filter(({ shift }) => !shift.scheduleBlockRef)
                    .map(({ shift, shiftIndex }) => (
                      <div
                        key={shift.id ?? `unassigned-${shiftIndex}`}
                        className="grid gap-2 rounded-md border border-amber-500/20 bg-background/80 p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(14rem,2fr)_auto]"
                      >
                        <Input
                          placeholder="Role"
                          value={shift.role}
                          onChange={(e) =>
                            setShifts((prev) =>
                              prev.map((row, i) => (i === shiftIndex ? { ...row, role: e.target.value } : row)),
                            )
                          }
                        />
                        {shift.crewApplicationId ? (
                          <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                            <span className="truncate font-medium">{shift.personName || "Trainee"}</span>
                            <span className="ml-1.5 shrink-0 text-xs text-muted-foreground">trainee</span>
                          </div>
                        ) : (
                          <UserSelect
                            value={shift.userId ?? ""}
                            onChange={(value) =>
                              setShifts((prev) =>
                                prev.map((row, i) =>
                                  i === shiftIndex
                                    ? {
                                        ...row,
                                        userId: value || undefined,
                                        personName:
                                          userOptions.find((option) => option.value === value)?.label ?? row.personName,
                                      }
                                    : row,
                                ),
                              )
                            }
                            options={userSelectOptions}
                            emptyLabel="Select crew user"
                          />
                        )}
                        <DateTimeRangePicker
                          startValue={shift.startsAt}
                          endValue={shift.endsAt}
                          onChange={({ start, end }) =>
                            setShifts((prev) =>
                              prev.map((row, i) =>
                                i === shiftIndex ? { ...row, startsAt: start, endsAt: end } : row,
                              ),
                            )
                          }
                          placeholder="Shift start and end"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShifts((prev) => prev.filter((_, i) => i !== shiftIndex))}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
            <Button type="button" disabled={!eventId} onClick={() => void saveScheduleAndPersonnel()}>
              Save Schedule & Personnel
            </Button>
          </CardContent>
        </Card>
        </fieldset>
      ) : null}

      {resolvedActiveTab === "equipment" ? (
        <Card>
          <CardHeader>
            <CardTitle>Pull List</CardTitle>
          </CardHeader>
          <CardContent>
            {!currentEventId ? (
              <p className="text-sm text-muted-foreground">Save the event first to manage equipment.</p>
            ) : (
              <EventPullList
                key={pullListSyncKey}
                eventId={currentEventId}
                eventType={eventType}
                rentalFulfillmentMode={rentalFulfillmentMode}
                invoiceId={invoiceId ? (invoiceId as Id<"invoices">) : undefined}
                seriesLinked={Boolean(seriesMeta && !seriesMeta.seriesDetached)}
                initialItems={pullListInitialItems}
                onSaved={(text) => {
                  flash("success", text);
                }}
                onError={(text) => {
                  flash("error", text);
                }}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {resolvedActiveTab === "artifacts" ? (
        <Card>
          <CardHeader><CardTitle>Artifacts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!currentEventId ? (
              <p className="text-sm text-muted-foreground">Save the event first to manage artifacts.</p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
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
                </div>
                <Input placeholder="Markdown/content" value={artifactMarkdown} onChange={(e) => setArtifactMarkdown(e.target.value)} />
                <EventArtifactUploadField
                  eventId={currentEventId}
                  urlValue={artifactLinkUrl}
                  onUploaded={(storedValue) => setArtifactLinkUrl(storedValue)}
                  onUrlChange={setArtifactLinkUrl}
                  onClear={() => setArtifactLinkUrl("")}
                />
                <Button
                  type="button"
                  disabled={!artifactTitle.trim()}
                  onClick={async () => {
                    if (!currentEventId) return;
                    await createArtifact({
                      eventId: currentEventId,
                      artifactType,
                      title: artifactTitle,
                      markdown: artifactMarkdown || undefined,
                      linkUrl: artifactLinkUrl.trim() || undefined,
                    });
                    setArtifactTitle("");
                    setArtifactMarkdown("");
                    setArtifactLinkUrl("");
                    flash("success", "Artifact added.");
                  }}
                >
                  Add Artifact
                </Button>
              </>
            )}
            <div className="space-y-2">
              {(eventData?.artifacts ?? []).map((row) => (
                  <div key={row._id} className="rounded-md border px-3 py-2 text-sm space-y-2">
                    <div>
                      <p className="font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{row.artifactType}</p>
                      {row.markdown ? (
                        <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{row.markdown}</p>
                      ) : null}
                    </div>
                    <EventArtifactAttachment linkUrl={row.linkUrl} fileUrl={row.fileUrl} />
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {resolvedActiveTab === "media" ? (
        !currentEventId ? (
          <Card>
            <CardHeader>
              <CardTitle>Media</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Save the event first to manage media.</p>
            </CardContent>
          </Card>
        ) : (
          <EventMediaSection eventId={currentEventId} />
        )
      ) : null}

      {resolvedActiveTab === "expenses" ? (
        <Card>
          <CardHeader><CardTitle>Event Costs</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {seriesMeta ? (
              <div className="rounded-md border border-dashed p-3 space-y-2">
                <p className="text-sm font-medium">Recurring series costs</p>
                <p className="text-xs text-muted-foreground">
                  Per-occurrence template defaults and series-wide costs are managed on the{" "}
                  <Link href={`/dashboard/events/series/${seriesMeta._id}`} className="underline">
                    series page
                  </Link>
                  . Crew cost remains unique to each occurrence.
                </p>
                <div className="grid gap-2 md:grid-cols-4 text-sm">
                  <p>Template bands / event: {formatUsd(seriesMeta.occurrenceBandsCostUsd ?? 0)}</p>
                  <p>
                    Template external / event: {formatUsd(seriesMeta.occurrenceExternalRentalsCostUsd ?? 0)}
                  </p>
                  <p>Template other / event: {formatUsd(seriesMeta.occurrenceOtherCostUsd ?? 0)}</p>
                  <p>Series-wide recurring: {formatUsd(seriesRecurringTotalUsd)}</p>
                </div>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Crew costs are auto-calculated from assigned users in schedule shifts:
              each user uses their hourly rate, and hours beyond 8/day are billed at 1.5x
              {computedCrewCost?.otPremium ? " (this event uses whole-event OT premium)." : "."}
            </p>
            {computedCrewCost?.bufferPercent !== undefined && computedCrewCost.bufferPercent > 0 ? (
              <p className="text-xs text-muted-foreground">
                Buffered crew cost ({computedCrewCost.bufferPercent}%):{" "}
                {formatUsd(computedCrewCost.bufferedTotalCostUsd ?? computedCrewCost.totalCostUsd)}
              </p>
            ) : null}
            {isAdmin ? (
              <div className="grid gap-2 rounded-md border border-dashed p-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={otPremium}
                    onChange={(e) => setOtPremium(e.target.checked)}
                  />
                  OT premium (whole event 1.5×)
                </label>
                <div className="space-y-1">
                  <Label>Per-event crew buffer %</Label>
                  <Input
                    value={crewCostBufferPercent}
                    onChange={(e) => setCrewCostBufferPercent(e.target.value)}
                    placeholder="Use global default"
                  />
                </div>
                <p className="text-xs text-muted-foreground md:col-span-2">
                  OT premium inflates Stanford input hours (1.5× for hours 1–8) and bills all crew hours at 1.5× rate.
                </p>
              </div>
            ) : null}
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
                <Input
                  value={bandsCostUsd}
                  onChange={(e) => setBandsCostUsd(e.target.value)}
                  readOnly={readOnly}
                />
                {seriesMeta ? (
                  <p className="text-xs text-muted-foreground">This occurrence only unless you choose a series scope on save.</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>External Rentals Cost (USD)</Label>
                <Input
                  value={externalRentalsCostUsd}
                  onChange={(e) => setExternalRentalsCostUsd(e.target.value)}
                  readOnly={readOnly}
                />
              </div>
              <div className="space-y-1">
                <Label>Other Costs (USD)</Label>
                <Input
                  value={otherCostUsd}
                  onChange={(e) => setOtherCostUsd(e.target.value)}
                  readOnly={readOnly}
                />
              </div>
            </div>
            {linkedInvoice ? (
              <div className="rounded-md border p-3" data-testid="event-linked-invoice-margin">
                <p className="text-sm font-medium">Linked Invoice Margin</p>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <p className="text-xs text-muted-foreground">Total Billed</p>
                    <p className="font-semibold">{formatUsd(billedTotalUsd!)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {seriesMeta ? "Total Series Cost (projected)" : "Total Event Cost"}
                    </p>
                    <p className="font-semibold">{formatUsd(marginCostUsd)}</p>
                  </div>
                  <div
                    className={`rounded-md border px-3 py-2 text-sm ${
                      (profitLossUsd ?? 0) >= 0
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
                        : "border-rose-500/40 bg-rose-500/10 text-rose-800"
                    }`}
                  >
                    <p className="text-xs">Net profit</p>
                    <p className="font-semibold">{formatUsd(profitLossUsd ?? 0)}</p>
                  </div>
                </div>
              </div>
            ) : invoiceId ? (
              <p className="text-xs text-muted-foreground" data-testid="event-linked-invoice-loading">
                Linked invoice not loaded yet. Margin will appear once invoice data is available.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="event-linked-invoice-missing">
                Link an invoice in Overview to view billed total vs event cost margin.
              </p>
            )}
            {computedCrewCost?.missingRateUsers?.length || computedCrewCost?.missingRateOpenSlotCount ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800">
                {computedCrewCost.missingRateUsers?.length ? (
                  <>
                    Missing hourly rates for: {computedCrewCost.missingRateUsers.join(", ")}. These rows are included at
                    $0.00 until a base rate is added.{" "}
                  </>
                ) : null}
                {computedCrewCost.missingRateOpenSlotCount ? (
                  <>
                    {computedCrewCost.missingRateOpenSlotCount} open slot
                    {computedCrewCost.missingRateOpenSlotCount === 1 ? " is" : "s are"} estimated at $0.00 because
                    global Normal/Lead crew rates are unset.{" "}
                  </>
                ) : null}
                <Link href="/dashboard/users/crew-rates" className="underline underline-offset-2">
                  Manage crew rates
                </Link>
                .
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
                          <p className="text-sm font-semibold">{formatUsd(block.subtotalUsd)}</p>
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
                                    {formatUsd(row.baseRateUsd)} / {formatUsd(row.overtimeRateUsd)}
                                  </td>
                                  <td className="px-3 py-2 text-right">{formatUsd(row.subtotalUsd)}</td>
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
            {canEdit ? (
            <Button type="button" onClick={() => void saveCore()}>
              Save Event Costs
            </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {editScopeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Apply changes to series?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This event is part of a recurring series. Crew scheduling is never updated in bulk.
              </p>
              <div className="flex flex-col gap-2">
                {(Object.keys(SERIES_EDIT_SCOPE_LABELS) as SeriesEditScope[]).map((scope) => (
                  <Button key={scope} type="button" variant="outline" onClick={() => void confirmEditScope(scope)}>
                    {SERIES_EDIT_SCOPE_LABELS[scope]}
                  </Button>
                ))}
                <Button type="button" variant="ghost" onClick={() => setEditScopeModalOpen(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {hostGroupModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>New Host</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newHostName} onChange={(e) => setNewHostName(e.target.value)} />
              </div>
              {hostNameSuggestion ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                  <p>
                    Did you mean{" "}
                    <span className="font-medium">{hostNameSuggestion.name}</span>
                    {hostNameSuggestion.matchKind === "alias" ? " (alias match)" : ""}?
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    variant="outline"
                    onClick={() => {
                      setHostGroupId(hostNameSuggestion._id);
                      setHostGroupModalOpen(false);
                      setNewHostName("");
                    }}
                  >
                    Use existing host
                  </Button>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={newHostType}
                  onChange={(e) =>
                    setNewHostType(e.target.value as "vso" | "house" | "department" | "individual")
                  }
                >
                  {INVOICE_GROUP_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Equipment pricing</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={newHostEquipmentPricingMode}
                  onChange={(e) =>
                    setNewHostEquipmentPricingMode(e.target.value as EquipmentPricingMode)
                  }
                >
                  {EQUIPMENT_PRICING_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={!newHostName.trim() || creatingHost}
                  onClick={() => void submitCreateHost()}
                >
                  {creatingHost ? "Creating…" : "Create Host"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={creatingHost}
                  onClick={() => setHostGroupModalOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {canEdit || isCreate ? (
      <FormSaveBar
        tier={saveTier}
        saveStatus={saveStatus}
        saveError={messageTone === "error" ? message : null}
        isDirty={hasUnsavedChanges}
        saveLabel={
          isCreate
            ? isRecurring
              ? "Create Series"
              : "Create Event"
            : resolvedActiveTab === "schedule"
              ? "Save Schedule & Personnel"
              : "Save Event"
        }
        onSave={handleBarSave}
        onRetry={handleBarSave}
      />
      ) : null}
    </div>
  );
}
