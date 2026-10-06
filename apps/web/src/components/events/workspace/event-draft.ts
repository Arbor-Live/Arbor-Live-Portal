import {
  CameraIcon,
  FilmSlateIcon,
  GearIcon,
  MegaphoneIcon,
  PackageIcon,
  PaintBrushIcon,
  QuestionIcon,
  SpeakerHighIcon,
  TruckIcon,
  VideoCameraIcon,
  WrenchIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@/lib/convex-api";
import type { SearchableSelectOption } from "@/components/inventory/searchable-select";
import { normalizeEventStatus, type EventStatus } from "@/lib/event-status";
import {
  DEFAULT_EVENT_VISIBILITY,
  normalizeEventVisibility,
  type EventVisibility,
} from "@/lib/event-visibility";
import { localDateTimeInputToMs, toLocalDateTimeInput } from "@/lib/crew-availability";

export type EventType = "Crewed Event" | "Rental with Crew" | "Dry Hire" | "Services Only";
type StoredEventType = EventType | "Dry Rental";
export type RentalFulfillmentMode = "delivery" | "will_call";
export type EventTeam =
  | "Design"
  | "Photography"
  | "Videography"
  | "Sound"
  | "Lighting"
  | "Promotion"
  | "Trivia"
  | "Operations";

export type ShiftDraft = {
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
  timesOverridden?: boolean;
};

export const EVENT_TYPES: EventType[] = ["Crewed Event", "Rental with Crew", "Dry Hire", "Services Only"];
export const EVENT_TEAMS: EventTeam[] = [
  "Design",
  "Photography",
  "Videography",
  "Sound",
  "Lighting",
  "Promotion",
  "Trivia",
  "Operations",
];
export const EVENT_TYPE_ICONS: Record<EventType, Icon> = {
  "Crewed Event": FilmSlateIcon,
  "Rental with Crew": TruckIcon,
  "Dry Hire": PackageIcon,
  "Services Only": WrenchIcon,
};
export const TEAM_ICONS: Record<EventTeam, Icon> = {
  Design: PaintBrushIcon,
  Photography: CameraIcon,
  Videography: VideoCameraIcon,
  Sound: SpeakerHighIcon,
  Lighting: GearIcon,
  Promotion: MegaphoneIcon,
  Trivia: QuestionIcon,
  Operations: WrenchIcon,
};

export const RENTAL_EVENT_TYPES: EventType[] = ["Dry Hire", "Rental with Crew"];
export const FULFILLMENT_OPTIONS: SearchableSelectOption[] = [
  { value: "delivery", label: "Delivery" },
  { value: "will_call", label: "Will-call" },
];

export function normalizeFulfillmentMode(
  value: RentalFulfillmentMode | "pickup" | "" | undefined,
): RentalFulfillmentMode {
  if (value === "pickup" || value === "delivery") return "delivery";
  return value === "will_call" ? "will_call" : "delivery";
}

export function normalizeEventType(value: string | undefined): EventType {
  const stored = value as StoredEventType | undefined;
  if (stored === "Dry Rental") return "Dry Hire";
  return stored ?? "Crewed Event";
}

/** Crew and equipment planning don't apply to a services-only booking. */
export function eventTypeHasLogistics(eventType: EventType) {
  return eventType !== "Services Only";
}

/**
 * Every field on the `events` record the workspace edits. Values stay in their
 * form representation (datetime-local strings, dollar strings) so dirty checks
 * compare exactly what the user sees.
 */
export type EventDraft = {
  title: string;
  status: EventStatus;
  visibility: EventVisibility;
  invoiceId: string;
  additionalInvoiceIds: string[];
  startAt: string;
  endAt: string;
  venueId: string;
  eventType: EventType;
  rentalFulfillmentMode: RentalFulfillmentMode;
  teamsInterested: EventTeam[];
  hostGroupId: string;
  additionalHostGroupIds: string[];
  managerUserId: string;
  dayOfLeadUserId: string;
  operationsLeadUserId: string;
  bandsCostUsd: string;
  externalRentalsCostUsd: string;
  otherCostUsd: string;
  otPremium: boolean;
  crewCostBufferPercent: string;
  notes: string;
  openMicEnabled: boolean;
  openMicNotes: string;
};

export type EventDraftKey = keyof EventDraft;

export const EMPTY_EVENT_DRAFT: EventDraft = {
  title: "",
  status: "tentative",
  visibility: DEFAULT_EVENT_VISIBILITY,
  invoiceId: "",
  additionalInvoiceIds: [],
  startAt: "",
  endAt: "",
  venueId: "",
  eventType: "Crewed Event",
  rentalFulfillmentMode: "delivery",
  teamsInterested: [],
  hostGroupId: "",
  additionalHostGroupIds: [],
  managerUserId: "",
  dayOfLeadUserId: "",
  operationsLeadUserId: "",
  bandsCostUsd: "0",
  externalRentalsCostUsd: "0",
  otherCostUsd: "0",
  otPremium: false,
  crewCostBufferPercent: "",
  notes: "",
  openMicEnabled: false,
  openMicNotes: "",
};

/** Which workspace tab owns each draft field — drives the save bar summary and tab dots. */
export type DraftSection = "details" | "billing" | "lineup" | "promo";

export const DRAFT_SECTION_LABELS: Record<DraftSection, string> = {
  details: "Details",
  billing: "Billing",
  lineup: "Lineup",
  promo: "Promo",
};

const DRAFT_FIELD_SECTIONS: Record<EventDraftKey, DraftSection> = {
  title: "details",
  status: "details",
  visibility: "promo",
  invoiceId: "billing",
  additionalInvoiceIds: "billing",
  startAt: "details",
  endAt: "details",
  venueId: "details",
  eventType: "details",
  rentalFulfillmentMode: "details",
  teamsInterested: "details",
  hostGroupId: "billing",
  additionalHostGroupIds: "billing",
  managerUserId: "details",
  dayOfLeadUserId: "details",
  operationsLeadUserId: "details",
  bandsCostUsd: "billing",
  externalRentalsCostUsd: "billing",
  otherCostUsd: "billing",
  otPremium: "billing",
  crewCostBufferPercent: "billing",
  notes: "details",
  openMicEnabled: "lineup",
  openMicNotes: "lineup",
};

export type EventDetail = NonNullable<FunctionReturnType<typeof api.events.get>>;
type EventRecord = EventDetail["event"];

export function draftFromEvent(
  event: EventRecord,
  options: {
    additionalInvoiceIds: string[];
    /** Legacy events only carry a free-text host; match it to a group when possible. */
    hostGroupIdFallback?: string;
  },
): EventDraft {
  return {
    title: event.title,
    status: normalizeEventStatus(event.status),
    visibility: normalizeEventVisibility(event.visibility),
    invoiceId: event.invoiceId ?? "",
    additionalInvoiceIds: options.additionalInvoiceIds,
    startAt: toLocalDateTimeInput(event.startAt),
    endAt: toLocalDateTimeInput(event.endAt),
    venueId: event.venueId ?? "",
    eventType: normalizeEventType(event.eventType),
    rentalFulfillmentMode: normalizeFulfillmentMode(
      event.rentalFulfillmentMode as RentalFulfillmentMode | "pickup" | undefined,
    ),
    teamsInterested: (event.teamsInterested as EventTeam[] | undefined) ?? [],
    hostGroupId: event.hostGroupId ?? options.hostGroupIdFallback ?? "",
    additionalHostGroupIds: (event.additionalHostGroupIds ?? []).map((id) => String(id)),
    managerUserId: event.eventManagerUserId ?? "",
    dayOfLeadUserId: event.dayOfLeadUserId ?? "",
    operationsLeadUserId: event.operationsLeadUserId ?? "",
    bandsCostUsd: String(event.bandsCostUsd ?? 0),
    externalRentalsCostUsd: String(event.externalRentalsCostUsd ?? 0),
    otherCostUsd: String(event.otherCostUsd ?? 0),
    otPremium: event.otPremium === true,
    crewCostBufferPercent:
      event.crewCostBufferPercent !== undefined ? String(event.crewCostBufferPercent) : "",
    notes: event.notes ?? "",
    openMicEnabled: event.openMicEnabled === true,
    openMicNotes: event.openMicNotes ?? "",
  };
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function changedDraftKeys(draft: EventDraft, baseline: EventDraft | null): EventDraftKey[] {
  if (!baseline) return [];
  return (Object.keys(draft) as EventDraftKey[]).filter(
    (key) => !sameValue(draft[key], baseline[key]),
  );
}

export function dirtySections(changedKeys: EventDraftKey[]): Set<DraftSection> {
  return new Set(changedKeys.map((key) => DRAFT_FIELD_SECTIONS[key]));
}

function parseUsd(value: string) {
  return Number(value || "0");
}

/**
 * Build `events.update` args from only the fields that changed. Omitted args
 * mean "unchanged" on the server, so saving the title can never clobber a
 * field this client never loaded (e.g. a legacy free-text host).
 */
export function buildEventUpdatePatch(
  draft: EventDraft,
  changedKeys: EventDraftKey[],
  options: { isAdmin: boolean; hasOperationsAccess: boolean; effectivePrimaryHostGroupId: string },
) {
  const changed = new Set(changedKeys);
  const patch: {
    title?: string;
    status?: EventStatus;
    visibility?: EventVisibility;
    invoiceId?: Id<"invoices"> | null;
    additionalInvoiceIds?: Id<"invoices">[];
    startAt?: number;
    endAt?: number;
    venueId?: Id<"venues"> | null;
    eventType?: EventType;
    rentalFulfillmentMode?: RentalFulfillmentMode;
    teamsInterested?: EventTeam[];
    hostGroupId?: Id<"invoiceGroups"> | null;
    additionalHostGroupIds?: Id<"invoiceGroups">[];
    eventManagerUserId?: string;
    dayOfLeadUserId?: string;
    operationsLeadUserId?: string;
    bandsCostUsd?: number;
    externalRentalsCostUsd?: number;
    otherCostUsd?: number;
    otPremium?: boolean;
    crewCostBufferPercent?: number;
    notes?: string;
    openMicEnabled?: boolean;
    openMicNotes?: string;
  } = {};

  if (changed.has("title")) patch.title = draft.title.trim();
  if (changed.has("status")) patch.status = draft.status;
  if (changed.has("visibility")) patch.visibility = draft.visibility;
  if (changed.has("invoiceId") || changed.has("additionalInvoiceIds")) {
    patch.invoiceId = draft.invoiceId ? (draft.invoiceId as Id<"invoices">) : null;
    patch.additionalInvoiceIds = draft.additionalInvoiceIds.map((id) => id as Id<"invoices">);
  }
  if (changed.has("startAt") || changed.has("endAt")) {
    patch.startAt = localDateTimeInputToMs(draft.startAt) ?? Number.NaN;
    patch.endAt = localDateTimeInputToMs(draft.endAt) ?? Number.NaN;
  }
  if (changed.has("venueId")) {
    patch.venueId = draft.venueId ? (draft.venueId as Id<"venues">) : null;
  }
  if (changed.has("eventType") || changed.has("rentalFulfillmentMode")) {
    patch.eventType = draft.eventType;
    if (RENTAL_EVENT_TYPES.includes(draft.eventType)) {
      patch.rentalFulfillmentMode = draft.rentalFulfillmentMode;
    }
  }
  if (changed.has("teamsInterested")) patch.teamsInterested = draft.teamsInterested;
  // With an invoice linked, the invoice's group is the primary host.
  if (changed.has("hostGroupId") && !draft.invoiceId) {
    patch.hostGroupId = draft.hostGroupId ? (draft.hostGroupId as Id<"invoiceGroups">) : null;
  }
  if (
    changed.has("additionalHostGroupIds") ||
    patch.hostGroupId !== undefined ||
    patch.invoiceId !== undefined
  ) {
    patch.additionalHostGroupIds = draft.additionalHostGroupIds
      .filter((id) => id && id !== options.effectivePrimaryHostGroupId)
      .map((id) => id as Id<"invoiceGroups">);
  }
  // "" is an explicit clear on the server; undefined means unchanged.
  if (changed.has("managerUserId")) patch.eventManagerUserId = draft.managerUserId;
  if (changed.has("dayOfLeadUserId")) patch.dayOfLeadUserId = draft.dayOfLeadUserId;
  if (changed.has("operationsLeadUserId")) {
    patch.operationsLeadUserId = draft.operationsLeadUserId;
  }
  if (changed.has("bandsCostUsd")) patch.bandsCostUsd = parseUsd(draft.bandsCostUsd);
  if (changed.has("externalRentalsCostUsd")) {
    patch.externalRentalsCostUsd = parseUsd(draft.externalRentalsCostUsd);
  }
  if (changed.has("otherCostUsd")) patch.otherCostUsd = parseUsd(draft.otherCostUsd);
  if (changed.has("notes")) patch.notes = draft.notes;
  if (options.isAdmin) {
    if (changed.has("otPremium")) patch.otPremium = draft.otPremium;
    if (changed.has("crewCostBufferPercent") && draft.crewCostBufferPercent.trim() !== "") {
      patch.crewCostBufferPercent = Number(draft.crewCostBufferPercent);
    }
  }
  if (options.hasOperationsAccess) {
    if (changed.has("openMicEnabled")) patch.openMicEnabled = draft.openMicEnabled;
    if (changed.has("openMicNotes")) patch.openMicNotes = draft.openMicNotes;
  }
  return patch;
}
