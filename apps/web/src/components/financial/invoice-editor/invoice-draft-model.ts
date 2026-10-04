import { ARTIST_TBD_OPTION, ARTIST_TBD_VALUE } from "@/components/bands/artist-select";
import type { Id } from "@/lib/convex-api";
import { formatContactFullName } from "@/lib/contact-name";
import type { InvoiceCrewRow } from "@/lib/invoice-crew-from-event";

/**
 * The quote editor's draft: plain form values (strings while typing), and the
 * pure functions that turn them into the `createDraft` / `updateDraft`
 * payload. `useInvoiceDraft` owns the state; the section components only edit
 * rows.
 */

export type EquipmentBasis = "total" | "per_occurrence";

export type EquipmentRow = {
  refId: string;
  quantity: string;
  basis?: EquipmentBasis;
  /** Package rows only: BOM type ids excluded from this line (ala-carte discount). */
  excludedTypeIds?: string[];
  /** Package rows only: editable discount amount; undefined means "use suggested". */
  discountUsd?: string;
};
export type ExternalRentalRow = { provider: string; label: string; quantity: string; rateUsd: string };
/** `organizationId` empty / TBD sentinel ⇒ band not chosen yet. */
export type ArtistRow = {
  organizationId: string;
  label: string;
  /** Hours the group is performing. */
  hours: string;
  /** Number of people in the artist / DJ act. */
  people: string;
  /** Hourly rate per person. */
  rateUsd: string;
  /** Linked day/event this slot belongs to on multi-day bookings. */
  eventId?: string;
  /** The bill position this line stands for, echoed back on save. */
  needId?: string;
  /** Added as a new act: saving opens its own position rather than taking an open one. */
  opensPosition?: boolean;
};
export type CrewRow = InvoiceCrewRow;
export type FeeRow = { feeDefinitionId: string; label: string; quantity: string; rateUsd: string };

export type InvoiceArtistPosition = {
  needId: string;
  label: string;
  /** Empty means no preference. */
  artistTypes: Array<"band" | "dj" | "singer_songwriter">;
  status: "open" | "inquiring" | "booked";
  genres: string;
};

/** A position on a linked day's bill, as the quote editor lays it out. */
export type BillPosition = InvoiceArtistPosition & {
  eventId: string;
  actOrganizationId?: string;
  actName?: string;
};

export type ArtistBillItem = { kind: "line"; idx: number } | { kind: "open"; position: BillPosition };

/**
 * The Artists section as the bill: each position in bill order, as this
 * quote's line for it or as an open (unpriced) position; then lines no listed
 * position backs (new, moved, or on a series). Positions another invoice
 * prices belong to that invoice and are left out.
 */
export function layoutArtistBill(
  rows: readonly Pick<ArtistRow, "needId">[],
  positions: ReadonlyArray<BillPosition & { invoiceIds: readonly string[] }>,
  invoiceId: string | undefined,
): ArtistBillItem[] {
  const rowIndexByNeedId = new Map(rows.flatMap((row, idx) => (row.needId ? [[row.needId, idx] as const] : [])));
  const items: ArtistBillItem[] = [];
  const placed = new Set<number>();
  for (const { invoiceIds, ...position } of positions) {
    const idx = rowIndexByNeedId.get(position.needId);
    if (idx !== undefined) {
      placed.add(idx);
      items.push({ kind: "line", idx });
    } else if (invoiceIds.every((id) => id === invoiceId)) {
      items.push({ kind: "open", position });
    }
  }
  rows.forEach((_, idx) => {
    if (!placed.has(idx)) items.push({ kind: "line", idx });
  });
  return items;
}

export type CrewRateMode = "normal" | "lead" | "custom";
export type DiscountType = "amount" | "percent";
export type EquipmentPricingModeValue = "subsidized" | "nonSubsidized";

/** Every scalar on the quote form. Each key is one field of the saved payload. */
export type InvoiceDraftFields = {
  issueDate: string;
  dueDate: string;
  managerUserId: string;
  managerName: string;
  managerEmail: string;
  groupId: string;
  contactId: string;
  clientEmail: string;
  clientPhone: string;
  clientAddressLine1: string;
  clientAddressLine2: string;
  clientCity: string;
  clientState: string;
  clientPostalCode: string;
  equipmentPricingMode: EquipmentPricingModeValue;
  crewRateMode: CrewRateMode;
  /** Not saved directly: the rate custom-mode crew rows fall back to. */
  customCrewRateUsd: string;
  discountType: DiscountType;
  discountValue: string;
  notes: string;
  termsIds: Id<"invoiceTerms">[];
  additionalTermsMarkdown: string;
};

/** The line items, one list per section. */
export type InvoiceDraftLines = {
  equipmentPackages: EquipmentRow[];
  equipmentTypes: EquipmentRow[];
  externalRentals: ExternalRentalRow[];
  artists: ArtistRow[];
  crewRows: CrewRow[];
  fees: FeeRow[];
};

export function emptyDraftFields(issueDate = ""): InvoiceDraftFields {
  return {
    issueDate,
    dueDate: "",
    managerUserId: "",
    managerName: "",
    managerEmail: "",
    groupId: "",
    contactId: "",
    clientEmail: "",
    clientPhone: "",
    clientAddressLine1: "",
    clientAddressLine2: "",
    clientCity: "",
    clientState: "",
    clientPostalCode: "",
    equipmentPricingMode: "nonSubsidized",
    crewRateMode: "normal",
    customCrewRateUsd: "",
    discountType: "amount",
    discountValue: "0",
    notes: "",
    termsIds: [],
    additionalTermsMarkdown: "",
  };
}

export function emptyDraftLines(): InvoiceDraftLines {
  return {
    equipmentPackages: [],
    equipmentTypes: [],
    externalRentals: [],
    artists: [],
    crewRows: [],
    fees: [],
  };
}

export const ARTIST_TBD_LABEL = ARTIST_TBD_OPTION.label;

/** A new act on the quote: it gets a position of its own on the bill. */
export function emptyArtistRow(eventId?: string): ArtistRow {
  return {
    organizationId: ARTIST_TBD_VALUE,
    label: ARTIST_TBD_LABEL,
    hours: "1",
    people: "1",
    rateUsd: "0",
    eventId,
    opensPosition: true,
  };
}

export function isTbdArtist(row: Pick<ArtistRow, "organizationId">) {
  return !row.organizationId || row.organizationId === ARTIST_TBD_VALUE;
}

export function artistPersonHours(row: Pick<ArtistRow, "hours" | "people">) {
  const hours = Math.max(0, Number(row.hours || "0"));
  const people = Math.max(0, Number(row.people || "0"));
  return hours * people;
}

/** How a saved artist line and an editor row are matched: label, act, and day. */
export function artistLineKey(label: string, organizationId?: string | null, eventId?: string | null) {
  return `${label.trim()}|${organizationId ?? ""}|${eventId ?? ""}`;
}

export function artistRowFromLineItem(row: {
  organizationId?: string | null;
  eventId?: string | null;
  needId?: string | null;
  label: string;
  quantity: number;
  rateUsd: number;
  memberCount?: number | null;
  performanceHours?: number | null;
}): ArtistRow {
  const hasBreakdown =
    row.memberCount != null &&
    row.memberCount > 0 &&
    row.performanceHours != null &&
    row.performanceHours > 0;
  return {
    organizationId: row.organizationId?.trim() || ARTIST_TBD_VALUE,
    eventId: row.eventId?.trim() || undefined,
    needId: row.needId?.trim() || undefined,
    label: row.label,
    hours: hasBreakdown ? String(row.performanceHours) : "1",
    // Legacy lines stored people in quantity with no hours breakdown.
    people: hasBreakdown ? String(row.memberCount) : String(row.quantity || 1),
    rateUsd: row.rateUsd.toString(),
  };
}

/** A saved artist line's act and name, by the position it stands for. */
export type ServerArtistLines = ReadonlyMap<string, Pick<ArtistRow, "label" | "organizationId">>;

export function serverArtistLinesByNeed(
  lineItems: ReadonlyArray<Parameters<typeof artistRowFromLineItem>[0] & { section: string }>,
): ServerArtistLines {
  const out = new Map<string, Pick<ArtistRow, "label" | "organizationId">>();
  for (const line of lineItems) {
    if (line.section !== "artist" || !line.needId) continue;
    const row = artistRowFromLineItem(line);
    out.set(line.needId, { label: row.label, organizationId: row.organizationId });
  }
  return out;
}

/**
 * Bring server-side changes to artist lines into an open draft. Filling or
 * clearing a position on the event's Lineup rewrites its line, and removing
 * the position unlinks it; a draft that kept the old values would undo that on
 * its next save. Only rows still as the server last had them follow; a row the
 * user edited keeps the edit. Returns null when nothing changed.
 */
export function adoptServerArtistChanges(
  rows: readonly ArtistRow[],
  before: ServerArtistLines,
  after: ServerArtistLines,
): ArtistRow[] | null {
  let changed = false;
  const next = rows.map((row) => {
    if (!row.needId) return row;
    const was = before.get(row.needId);
    if (!was || row.label !== was.label || row.organizationId !== was.organizationId) return row;
    const now = after.get(row.needId);
    if (!now) {
      changed = true;
      return { ...row, needId: undefined };
    }
    if (now.label === was.label && now.organizationId === was.organizationId) return row;
    changed = true;
    return { ...row, label: now.label, organizationId: now.organizationId };
  });
  return changed ? next : null;
}

export function formatInvoiceDiscountInputValue(value: number, type: DiscountType) {
  if (type === "amount") return Number.isFinite(value) ? value.toFixed(2) : "0.00";
  return Number.isFinite(value) ? value.toString() : "0";
}

export function normalizeInvoiceDiscountInput(raw: string, type: DiscountType) {
  if (type !== "amount") return raw;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : raw;
}

type CrewRateSettings =
  | {
      crewNormalRateUsd?: number;
      crewLeadRateUsd?: number;
      crewOtRateUsd?: number;
    }
  | null
  | undefined;

/**
 * The $/hr a crew line bills at. Assigned people carry their own compensation
 * rate on the row (Lead $22, Normal $20, Custom). Open slots and unrated rows
 * use the invoice's crew rate mode (or the custom rate).
 */
export function crewLineRateUsd(
  row: Pick<CrewRow, "rateUsd">,
  crewRateMode: CrewRateMode,
  customCrewRateUsd: string,
  settings: CrewRateSettings,
) {
  const modeDefaultRate =
    crewRateMode === "lead"
      ? (settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd ?? settings?.crewNormalRateUsd ?? 0)
      : (settings?.crewNormalRateUsd ?? 0);
  const stamped = Number(row.rateUsd || "0");
  if (stamped > 0) return stamped;
  return crewRateMode === "custom" ? Number(customCrewRateUsd || "0") : modeDefaultRate;
}

/**
 * A hand-entered crew row's people × hours, when it has one. Rows from a
 * schedule (one per shift) and older rows with only a total don't.
 */
export function crewHeadcount(row: Pick<CrewRow, "hours" | "people">) {
  const hours = Number(row.hours);
  const people = Number(row.people);
  if (!(hours > 0) || !(people > 0)) return null;
  return { hours, people };
}

/** Person-hours for a hand-entered row edited as hours × people. */
export function crewPersonHours(hours: string, people: string) {
  return String(Math.max(0, Number(hours || "0")) * Math.max(0, Number(people || "0")));
}

/** Whether a crew row makes it onto the saved quote (blank or zero-hour rows don't). */
export function isBillableCrewRow(row: Pick<CrewRow, "label" | "quantity">) {
  return Boolean(row.label.trim()) && Number(row.quantity) > 0;
}

export type InvoiceLineItemInput = {
  section: "equipment_package" | "equipment_type" | "external_rental" | "artist" | "crew" | "fee";
  order: number;
  provider?: string;
  label: string;
  notes?: string;
  quantity: number;
  rateUsd: number;
  packageId?: Id<"inventoryPackages">;
  typeId?: Id<"inventoryTypes">;
  feeDefinitionId?: Id<"invoiceFeeDefinitions">;
  equipmentQuantityBasis?: EquipmentBasis;
  excludedTypeIds?: Id<"inventoryTypes">[];
  packageExclusionDiscountUsd?: number;
  organizationId?: string;
  eventId?: Id<"events">;
  needId?: Id<"eventArtistNeeds">;
  memberCount?: number;
  performanceHours?: number;
  crewSource?: "manual";
  opensPosition?: boolean;
};

export type LineItemContext = {
  packageNameById: (id: string) => string | undefined;
  typeLabelById: (id: string) => string | undefined;
  /** The only linked day, when there is exactly one (artist lines default to it). */
  singleDayEventId?: Id<"events">;
  crewRateMode: CrewRateMode;
  customCrewRateUsd: string;
  settings: CrewRateSettings;
};

/** The saved line items, in section order. Blank rows are skipped. */
export function buildInvoiceLineItems(lines: InvoiceDraftLines, ctx: LineItemContext) {
  let order = 0;
  const rows: InvoiceLineItemInput[] = [];
  for (const row of lines.equipmentPackages) {
    if (!row.refId || Number(row.quantity) <= 0) continue;
    const excludedTypeIds = (row.excludedTypeIds ?? []).filter(Boolean);
    rows.push({
      section: "equipment_package",
      order: order++,
      label: ctx.packageNameById(row.refId) ?? "Package",
      quantity: Number(row.quantity),
      rateUsd: 0,
      packageId: row.refId as Id<"inventoryPackages">,
      equipmentQuantityBasis: row.basis ?? "total",
      excludedTypeIds: excludedTypeIds.length ? (excludedTypeIds as Id<"inventoryTypes">[]) : undefined,
      packageExclusionDiscountUsd:
        row.discountUsd !== undefined && row.discountUsd !== "" ? Number(row.discountUsd) : undefined,
    });
  }
  for (const row of lines.equipmentTypes) {
    if (!row.refId || Number(row.quantity) <= 0) continue;
    rows.push({
      section: "equipment_type",
      order: order++,
      label: ctx.typeLabelById(row.refId) ?? "Type",
      quantity: Number(row.quantity),
      rateUsd: 0,
      typeId: row.refId as Id<"inventoryTypes">,
      equipmentQuantityBasis: row.basis ?? "total",
    });
  }
  for (const row of lines.externalRentals) {
    if (!row.label.trim()) continue;
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) continue;
    rows.push({
      section: "external_rental",
      order: order++,
      provider: row.provider.trim() || undefined,
      label: row.label.trim(),
      quantity,
      rateUsd: Number(row.rateUsd || "0"),
    });
  }
  for (const row of lines.artists) {
    const label = row.label.trim();
    const personHours = artistPersonHours(row);
    if (!label || personHours <= 0) continue;
    const people = Math.max(0, Number(row.people || "0"));
    const hours = Math.max(0, Number(row.hours || "0"));
    rows.push({
      section: "artist",
      order: order++,
      label,
      quantity: personHours,
      rateUsd: Number(row.rateUsd || "0"),
      organizationId: isTbdArtist(row) ? undefined : row.organizationId,
      eventId: (row.eventId as Id<"events"> | undefined) ?? ctx.singleDayEventId,
      needId: row.needId as Id<"eventArtistNeeds"> | undefined,
      opensPosition: !row.needId && row.opensPosition ? true : undefined,
      memberCount: people > 0 ? people : undefined,
      performanceHours: hours > 0 ? hours : undefined,
    });
  }
  for (const row of lines.crewRows) {
    if (!isBillableCrewRow(row)) continue;
    const split = crewHeadcount(row);
    rows.push({
      section: "crew",
      order: order++,
      label: row.label.trim(),
      quantity: Number(row.quantity),
      rateUsd: crewLineRateUsd(row, ctx.crewRateMode, ctx.customCrewRateUsd, ctx.settings),
      ...(split ? { memberCount: split.people, performanceHours: split.hours } : {}),
      // Hand-added hours on a linked quote, so they come back on load (schedule lines are rebuilt).
      ...(row.source === "manual" ? { crewSource: "manual" as const } : {}),
    });
  }
  for (const row of lines.fees) {
    if (!row.label.trim() || Number(row.quantity) <= 0) continue;
    rows.push({
      section: "fee",
      order: order++,
      label: row.label.trim(),
      quantity: Number(row.quantity),
      rateUsd: Number(row.rateUsd || "0"),
      feeDefinitionId: row.feeDefinitionId ? (row.feeDefinitionId as Id<"invoiceFeeDefinitions">) : undefined,
    });
  }
  return rows;
}

type HostGroup = { _id: string; name: string; type: "vso" | "house" | "department" | "individual" };
type HostContact = { _id: string; firstName: string; lastName: string };

/**
 * The full `createDraft` / `updateDraft` payload, or null when the quote can't
 * be saved yet (no manager, or no billable lines). Its JSON is the dirty
 * signature, so keep the key order stable.
 */
export function buildInvoicePayload(
  fields: InvoiceDraftFields,
  lineItems: InvoiceLineItemInput[],
  groups: HostGroup[] | undefined,
  contacts: HostContact[] | undefined,
) {
  if (!fields.managerUserId || !fields.managerName.trim()) return null;
  if (!lineItems.length) return null;
  const hostGroup = (groups ?? []).find((group) => group._id === fields.groupId);
  const hostContact = (contacts ?? []).find((contact) => contact._id === fields.contactId);
  return {
    issueDate: fields.issueDate,
    dueDate: fields.dueDate || undefined,
    managerUserId: fields.managerUserId,
    managerName: fields.managerName,
    managerEmail: fields.managerEmail || undefined,
    groupId: fields.groupId ? (fields.groupId as Id<"invoiceGroups">) : undefined,
    contactId: fields.contactId ? (fields.contactId as Id<"invoiceContacts">) : undefined,
    clientGroupName: hostGroup?.name,
    clientGroupType: hostGroup?.type,
    clientContactName: hostContact
      ? formatContactFullName(hostContact.firstName, hostContact.lastName)
      : undefined,
    clientEmail: fields.clientEmail || undefined,
    clientPhone: fields.clientPhone || undefined,
    clientAddressLine1: fields.clientAddressLine1 || undefined,
    clientAddressLine2: fields.clientAddressLine2 || undefined,
    clientCity: fields.clientCity || undefined,
    clientState: fields.clientState || undefined,
    clientPostalCode: fields.clientPostalCode || undefined,
    equipmentPricingMode: fields.equipmentPricingMode,
    crewRateMode: fields.crewRateMode,
    discountType: fields.discountType,
    discountValue: Number(fields.discountValue || "0"),
    notes: fields.notes || undefined,
    termsIds: fields.termsIds.length ? fields.termsIds : undefined,
    additionalTermsMarkdown: fields.additionalTermsMarkdown || undefined,
    lineItems,
  };
}

export type InvoicePayload = NonNullable<ReturnType<typeof buildInvoicePayload>>;
