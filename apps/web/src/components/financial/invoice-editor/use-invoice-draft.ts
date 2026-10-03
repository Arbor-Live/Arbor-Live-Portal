"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import { useAppDialog } from "@/components/ui/app-dialog";
import { assignableCrewSelectOptions } from "@/lib/user-select-description";
import {
  buildCrewRowsFromLinkedEvent,
  buildInvoiceCrewRowsFromShiftTemplateDrafts,
  mergeEventCrewWithManualRows,
  type CrewAssigneeRate,
  type InvoiceCrewRow,
} from "@/lib/invoice-crew-from-event";
import type { SeriesShiftTemplateDraft } from "@/lib/event-series-shifts";
import { getConvexAppErrorData, getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { computeInvoiceDraftTotals } from "@/lib/compute-invoice-draft-totals";
import {
  arborEarnedRevenueUsd,
  eventPassThroughCostUsd,
  invoicePassThroughUsd,
  netProfitCostUsd,
  netProfitFromInvoiceUsd,
} from "@/lib/invoice-profit";
import { equipmentDivisionWarnings } from "@/lib/equipment-division-warnings";
import { firstLinkedEventStartAtMs, invoiceDueDateFromFirstEvent } from "@/lib/invoice-due-date";
import {
  artistLineKey,
  adoptServerArtistChanges,
  artistRowFromLineItem,
  buildInvoiceLineItems,
  buildInvoicePayload,
  emptyDraftFields,
  emptyDraftLines,
  formatInvoiceDiscountInputValue,
  isTbdArtist,
  serverArtistLinesByNeed,
  type CrewRow,
  type EquipmentRow,
  type InvoiceDraftFields,
  type InvoiceDraftLines,
} from "./invoice-draft-model";

type SaveState = { status: "idle" | "saving" | "saved" | "error"; error: string | null };

/** How to handle a save that changes what the client approved (see `invoices.updateDraft`). */
export type ApprovedChange = {
  decision: "request_reapproval" | "keep_approval" | "match_approval";
  note?: string;
};

/**
 * The quote editor's draft: server hydration, the dirty signature, autosave
 * and explicit save, and the crew / artist lines that follow the linked event.
 *
 * Hydration runs once per invoice id. The saved baseline is taken only after
 * every async input (linked event or series, hosts, contacts, crew) settles,
 * so the editor doesn't open dirty. The signature deliberately closes over
 * the catalog lookups without depending on them: a package name arriving late
 * must not make a clean quote dirty and autosave it.
 */
export function useInvoiceDraft({
  invoiceId,
  initialIssueDate,
}: {
  invoiceId?: Id<"invoices">;
  initialIssueDate?: string;
}) {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const viewer = useSessionViewer();
  const account = useSessionShell()?.account;
  const convex = useConvex();

  const [fields, setFields] = useState<InvoiceDraftFields>(() => emptyDraftFields(initialIssueDate ?? ""));
  const [lines, setLines] = useState<InvoiceDraftLines>(emptyDraftLines);
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [activeInvoiceId, setActiveInvoiceId] = useState<Id<"invoices"> | undefined>(invoiceId);
  const [approvalToken, setApprovalToken] = useState("");
  const [lastSavedSignature, setLastSavedSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", error: null });
  const [invoiceFieldsHydrated, setInvoiceFieldsHydrated] = useState(() => !invoiceId);
  const [editorBaselineReady, setEditorBaselineReady] = useState(() => !invoiceId);
  const [selectedDayEventIdOverride, setSelectedDayEventIdOverride] = useState<Id<"events"> | undefined>();
  // Open when a save would change what the client approved and needs a decision.
  const [approvedChangeOpen, setApprovedChangeOpen] = useState(false);

  const saveRequestIdRef = useRef(0);
  const hasHydratedFromServerRef = useRef(false);
  const crewBootstrappedRef = useRef(false);
  const linkedEventCrewInitializedRef = useRef(false);
  const artistsBootstrappedFromEventRef = useRef(false);
  const artistsHydratedFromInvoiceRef = useRef(false);
  const baselineSignaturePendingRef = useRef(false);
  const serverArtistLinesRef = useRef<ReturnType<typeof serverArtistLinesByNeed> | null>(null);
  const savedCrewSnapshotRef = useRef<CrewRow[]>([]);
  const crewRowsByEventRef = useRef<Map<string, InvoiceCrewRow[]>>(new Map());
  const crewBucketsHydratedInvoiceRef = useRef<string | null>(null);

  const managerList = useQuery(api.invoices.listManagers, {});
  const groups = useQuery(api.invoiceGroups.list, { activeOnly: true });
  const settings = useQuery(api.invoiceSettings.get, {});
  const invoiceData = useQuery(api.invoices.get, invoiceId ? { id: invoiceId } : "skip");
  const contacts = useQuery(api.invoiceContacts.list, {
    activeOnly: true,
    ...(fields.groupId ? { groupId: fields.groupId as Id<"invoiceGroups"> } : {}),
  });
  const linkedEvent = useQuery(
    api.events.getByInvoiceId,
    activeInvoiceId ? { invoiceId: activeInvoiceId } : "skip",
  );
  const linkedSeries = invoiceData?.series ?? linkedEvent?.series ?? null;
  const linkedDayEvents = useMemo(() => linkedEvent?.linkedEvents ?? [], [linkedEvent?.linkedEvents]);
  const seriesCostData = useQuery(
    api.eventSeries.get,
    linkedSeries?.seriesId ? { id: linkedSeries.seriesId } : "skip",
  );
  const pullListSyncStatus = useQuery(
    api.eventPullLists.getInvoiceSyncStatus,
    linkedEvent && !linkedSeries ? { eventId: linkedEvent._id } : "skip",
  );
  const bandsForArtists = useQuery(api.users.listBandsForInvoiceLines, {});
  const eventPerformers = useQuery(
    api.eventBands.listPerformersForEvents,
    linkedEvent && !linkedSeries ? { eventIds: linkedDayEvents.map((day) => day._id) } : "skip",
  );

  const createDraft = useMutation(api.invoices.createDraft);
  const updateDraft = useMutation(api.invoices.updateDraft);
  const scaffoldPullListFromInvoice = useMutation(api.eventPullLists.scaffoldFromInvoice);

  const selectedPackageIds = useMemo(
    () => lines.equipmentPackages.map((row) => row.refId).filter(Boolean) as Id<"inventoryPackages">[],
    [lines.equipmentPackages],
  );
  const selectedTypeIds = useMemo(
    () => lines.equipmentTypes.map((row) => row.refId).filter(Boolean) as Id<"inventoryTypes">[],
    [lines.equipmentTypes],
  );
  const packages = useQuery(
    api.inventoryPackages.getOptionsByIds,
    selectedPackageIds.length ? { ids: selectedPackageIds } : "skip",
  );
  const types = useQuery(
    api.inventoryTypes.getOptionsByIds,
    selectedTypeIds.length ? { ids: selectedTypeIds } : "skip",
  );
  const packageById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof packages>[number]>();
    for (const pkg of packages ?? []) map.set(pkg._id, pkg);
    return map;
  }, [packages]);
  const typeById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof types>[number]>();
    for (const type of types ?? []) map.set(type._id, type);
    return map;
  }, [types]);

  const primaryLinkedEventIds = new Set<string>(linkedDayEvents.map((day) => day._id));
  if (linkedEvent?._id) primaryLinkedEventIds.add(linkedEvent._id);
  const otherLinkedEvents = (invoiceData?.additionallyLinkedEvents ?? []).filter(
    (event) => !primaryLinkedEventIds.has(event._id),
  );
  const selectedDayEventId = useMemo(() => {
    if (!linkedEvent || linkedSeries) return undefined;
    if (
      selectedDayEventIdOverride &&
      (linkedDayEvents.some((day) => day._id === selectedDayEventIdOverride) || linkedDayEvents.length === 0)
    ) {
      return selectedDayEventIdOverride;
    }
    return linkedDayEvents[0]?._id ?? linkedEvent._id;
  }, [linkedDayEvents, linkedEvent, linkedSeries, selectedDayEventIdOverride]);
  const billableOccurrenceCount =
    linkedSeries?.activeOccurrenceCount ||
    linkedDayEvents.filter((day) => day.status !== "cancelled").length ||
    0;

  const managerOptions = useMemo(() => assignableCrewSelectOptions(managerList), [managerList]);

  const { crewRateMode, customCrewRateUsd } = fields;
  const defaultCrewHourlyRateUsd = useMemo(() => {
    if (crewRateMode === "lead") {
      return settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd ?? settings?.crewNormalRateUsd ?? 0;
    }
    if (crewRateMode === "custom") {
      const custom = Number(customCrewRateUsd);
      if (Number.isFinite(custom) && customCrewRateUsd.trim() !== "") return custom;
      return settings?.crewNormalRateUsd ?? 0;
    }
    return settings?.crewNormalRateUsd ?? 0;
  }, [crewRateMode, customCrewRateUsd, settings]);

  const crewRatesByUserId = useMemo(() => {
    const map = new Map<string, CrewAssigneeRate>();
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

  /** Set one field. Unchanged values keep the same draft object (see the signature note above). */
  const setField = useCallback(<K extends keyof InvoiceDraftFields>(key: K, value: InvoiceDraftFields[K]) => {
    setFields((current) => (current[key] === value ? current : { ...current, [key]: value }));
  }, []);

  /** Update one section's rows. */
  const setSection = useCallback(
    <K extends keyof InvoiceDraftLines>(key: K, updater: SetStateAction<InvoiceDraftLines[K]>) => {
      setLines((current) => {
        const next =
          typeof updater === "function"
            ? (updater as (rows: InvoiceDraftLines[K]) => InvoiceDraftLines[K])(current[key])
            : updater;
        return next === current[key] ? current : { ...current, [key]: next };
      });
    },
    [],
  );

  const setCrewRows = useCallback(
    (updater: SetStateAction<CrewRow[]>) => setSection("crewRows", updater),
    [setSection],
  );

  /** Edit only the hand-added crew hours; rows from the linked schedule stay as they are. */
  const setManualCrewRows = useCallback(
    (updater: SetStateAction<CrewRow[]>) => {
      setCrewRows((current) => {
        const eventRows = current.filter((row) => row.source === "event");
        const prevManual = current.filter((row) => row.source === "manual");
        const nextManual = typeof updater === "function" ? updater(prevManual) : updater;
        return [...eventRows, ...nextManual.map((row) => ({ ...row, source: "manual" as const }))];
      });
    },
    [setCrewRows],
  );

  // --- Crew lines from the linked event -----------------------------------

  const flattenCrewBuckets = useCallback((dayEvents: Array<{ _id: Id<"events">; title: string }>) => {
    const multiDay = dayEvents.length > 1;
    const rows: InvoiceCrewRow[] = [];
    for (let index = 0; index < dayEvents.length; index += 1) {
      const day = dayEvents[index]!;
      const dayRows = crewRowsByEventRef.current.get(day._id) ?? [];
      const dayPrefix = multiDay ? `Day ${index + 1} — ` : "";
      for (const row of dayRows) {
        rows.push({
          ...row,
          label: row.label.startsWith(dayPrefix) ? row.label : `${dayPrefix}${row.label}`,
        });
      }
    }
    return rows;
  }, []);

  const handleEventCrewRowsChange = useCallback(
    (eventRows: InvoiceCrewRow[]) => {
      if (!crewBootstrappedRef.current) return;
      if (!selectedDayEventId) return;
      linkedEventCrewInitializedRef.current = true;
      crewRowsByEventRef.current.set(selectedDayEventId, eventRows);
      const days = linkedDayEvents.length > 0 ? linkedDayEvents : [{ _id: selectedDayEventId, title: "" }];
      setCrewRows((current) => mergeEventCrewWithManualRows(flattenCrewBuckets(days), current));
    },
    [flattenCrewBuckets, linkedDayEvents, selectedDayEventId, setCrewRows],
  );

  const handleSeriesShiftDraftsChange = useCallback(
    (drafts: SeriesShiftTemplateDraft[]) => {
      if (!crewBootstrappedRef.current) return;
      if (!seriesCostData?.series?.blockTemplates) return;
      linkedEventCrewInitializedRef.current = true;
      const eventRows = buildInvoiceCrewRowsFromShiftTemplateDrafts({
        drafts,
        blockTemplates: seriesCostData.series.blockTemplates,
        billableOccurrenceCount,
        openSlotRateUsd: defaultCrewHourlyRateUsd,
      });
      setCrewRows((current) => mergeEventCrewWithManualRows(eventRows, current));
    },
    [billableOccurrenceCount, defaultCrewHourlyRateUsd, seriesCostData, setCrewRows],
  );

  /** Re-read every linked day's crew on the next pass (after copying a day's setup). */
  const invalidateCrewBuckets = useCallback(() => {
    crewBucketsHydratedInvoiceRef.current = null;
  }, []);

  useEffect(() => {
    if (!activeInvoiceId || !linkedEvent || linkedSeries) return;
    const hydrateKey = `${activeInvoiceId}:${crewRatesByUserId.size}:${defaultCrewHourlyRateUsd}`;
    if (crewBucketsHydratedInvoiceRef.current === hydrateKey) return;

    const days = linkedEvent.linkedEvents ?? [];
    const dayIds = days.length > 0 ? days.map((day) => day._id) : [linkedEvent._id];
    const blocksByEvent = new Map<string, typeof linkedEvent.blocks>();
    const shiftsByEvent = new Map<string, typeof linkedEvent.shifts>();
    for (const block of linkedEvent.blocks) {
      const list = blocksByEvent.get(block.eventId) ?? [];
      list.push(block);
      blocksByEvent.set(block.eventId, list);
    }
    for (const shift of linkedEvent.shifts) {
      const list = shiftsByEvent.get(shift.eventId) ?? [];
      list.push(shift);
      shiftsByEvent.set(shift.eventId, list);
    }

    crewRowsByEventRef.current = new Map();
    for (const eventId of dayIds) {
      const blocks = blocksByEvent.get(eventId) ?? [];
      const shifts = (shiftsByEvent.get(eventId) ?? []).map((shift) => ({
        _id: shift._id,
        scheduleBlockId: shift.scheduleBlockId,
        role: shift.role,
        personName: shift.personName,
        userId: shift.userId,
        hours: shift.hours,
      }));
      crewRowsByEventRef.current.set(
        eventId,
        buildCrewRowsFromLinkedEvent(
          {
            blocks: blocks.map((block) => ({ _id: block._id, label: block.label, blockType: block.blockType })),
            shifts,
          },
          { ratesByUserId: crewRatesByUserId, openSlotRateUsd: defaultCrewHourlyRateUsd },
        ),
      );
    }
    crewBucketsHydratedInvoiceRef.current = hydrateKey;
    linkedEventCrewInitializedRef.current = true;
    const dayMeta = days.length > 0 ? days : [{ _id: linkedEvent._id, title: linkedEvent.title }];
    setCrewRows((current) => mergeEventCrewWithManualRows(flattenCrewBuckets(dayMeta), current));
  }, [
    activeInvoiceId,
    crewRatesByUserId,
    defaultCrewHourlyRateUsd,
    flattenCrewBuckets,
    linkedEvent,
    linkedSeries,
    setCrewRows,
  ]);

  // --- Defaults and hydration ---------------------------------------------

  useEffect(() => {
    if (!fields.managerUserId && viewer?.userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFields((current) => ({
        ...current,
        managerUserId: viewer.userId,
        managerName: account?.name ?? "",
        managerEmail: account?.email ?? "",
      }));
    }
  }, [account?.email, account?.name, fields.managerUserId, viewer?.userId]);

  useEffect(() => {
    if (fields.issueDate) return;
    if (invoiceId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setField("issueDate", new Date().toISOString().slice(0, 10));
  }, [fields.issueDate, invoiceId, setField]);

  const suggestedDueDate = useMemo(() => {
    const firstDayAt = firstLinkedEventStartAtMs(linkedEvent?.linkedEvents) ?? linkedEvent?.startAt;
    if (firstDayAt == null) return "";
    return invoiceDueDateFromFirstEvent(firstDayAt);
  }, [linkedEvent?.linkedEvents, linkedEvent?.startAt]);

  useEffect(() => {
    if (dueDateTouched) return;
    if (!suggestedDueDate) return;
    // Wait until server fields land so hydration cannot wipe a just-filled date.
    if (invoiceId && !invoiceFieldsHydrated) return;
    if (fields.dueDate === suggestedDueDate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setField("dueDate", suggestedDueDate);
  }, [fields.dueDate, dueDateTouched, invoiceId, invoiceFieldsHydrated, setField, suggestedDueDate]);

  useEffect(() => {
    hasHydratedFromServerRef.current = false;
    crewBootstrappedRef.current = false;
    linkedEventCrewInitializedRef.current = false;
    crewBucketsHydratedInvoiceRef.current = null;
    crewRowsByEventRef.current = new Map();
    baselineSignaturePendingRef.current = false;
    savedCrewSnapshotRef.current = [];
    // New invoices have no server hydrate step — treat empty defaults as hydrated so
    // FormSaveBar dirty tracking works on /invoices/new.
    /* eslint-disable react-hooks/set-state-in-effect -- reset editor state when navigating between invoices */
    setSelectedDayEventIdOverride(undefined);
    setInvoiceFieldsHydrated(!invoiceId);
    setEditorBaselineReady(!invoiceId);
    setDueDateTouched(false);
    setField("customCrewRateUsd", "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [invoiceId, setField]);

  useEffect(() => {
    if (!invoiceData || !invoiceId) return;
    if (invoiceData.invoice._id !== invoiceId) return;
    if (hasHydratedFromServerRef.current) return;

    const { invoice, lineItems } = invoiceData;
    hasHydratedFromServerRef.current = true;
    const savedCrewRows = lineItems.filter((row) => row.section === "crew");
    savedCrewSnapshotRef.current = savedCrewRows.map((row) => ({
      label: row.label,
      quantity: row.quantity.toString(),
      rateUsd: row.rateUsd.toString(),
      ...(row.memberCount && row.performanceHours
        ? { people: row.memberCount.toString(), hours: row.performanceHours.toString() }
        : {}),
      ...(row.crewSource === "manual" ? { source: "manual" as const } : {}),
    }));
    const savedCustomRate =
      invoice.crewRateMode === "custom"
        ? (savedCrewRows.find((row) => row.rateUsd > 0)?.rateUsd ?? savedCrewRows[0]?.rateUsd)
        : undefined;

    // One-time hydration per invoice id (see the hasHydratedFromServerRef guard).
    setActiveInvoiceId(invoice._id);
    setApprovalToken(invoice.publicApprovalToken ?? "");
    setDueDateTouched(Boolean(invoice.dueDate?.trim()));
    setFields({
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate ?? "",
      managerUserId: invoice.managerUserId,
      managerName: invoice.managerName,
      managerEmail: invoice.managerEmail ?? "",
      groupId: invoice.groupId ?? "",
      contactId: invoice.contactId ?? "",
      clientEmail: invoice.clientEmail ?? "",
      clientPhone: invoice.clientPhone ?? "",
      clientAddressLine1: invoice.clientAddressLine1 ?? "",
      clientAddressLine2: invoice.clientAddressLine2 ?? "",
      clientCity: invoice.clientCity ?? "",
      clientState: invoice.clientState ?? "",
      clientPostalCode: invoice.clientPostalCode ?? "",
      equipmentPricingMode: invoice.equipmentPricingMode,
      crewRateMode: invoice.crewRateMode === "ot" ? "lead" : invoice.crewRateMode,
      customCrewRateUsd: savedCustomRate != null ? String(savedCustomRate) : "",
      discountType: invoice.discountType,
      discountValue: formatInvoiceDiscountInputValue(invoice.discountValue, invoice.discountType),
      notes: invoice.notes ?? "",
      termsIds: invoice.termsIds?.length ? invoice.termsIds : invoice.termsId ? [invoice.termsId] : [],
      additionalTermsMarkdown: invoice.additionalTermsMarkdown ?? "",
    });
    setLines((current) => ({
      equipmentPackages: lineItems
        .filter((row) => row.section === "equipment_package")
        .map((row) => ({
          refId: row.packageId ?? "",
          quantity: row.quantity.toString(),
          basis: row.equipmentQuantityBasis ?? "total",
          excludedTypeIds: row.excludedTypeIds ?? [],
          discountUsd:
            row.packageExclusionDiscountUsd != null ? row.packageExclusionDiscountUsd.toString() : undefined,
        })),
      equipmentTypes: lineItems
        .filter((row) => row.section === "equipment_type")
        .map((row) => ({
          refId: row.typeId ?? "",
          quantity: row.quantity.toString(),
          basis: row.equipmentQuantityBasis ?? "total",
        })),
      externalRentals: lineItems
        .filter((row) => row.section === "external_rental")
        .map((row) => ({
          provider: row.provider ?? "",
          label: row.label,
          quantity: row.quantity.toString(),
          rateUsd: row.rateUsd.toString(),
        })),
      artists: lineItems.filter((row) => row.section === "artist").map((row) => artistRowFromLineItem(row)),
      // Crew comes from the linked schedule or the saved snapshot (the bootstrap below).
      crewRows: current.crewRows,
      fees: lineItems
        .filter((row) => row.section === "fee")
        .map((row) => ({
          feeDefinitionId: row.feeDefinitionId ?? "",
          label: row.label,
          quantity: row.quantity.toString(),
          rateUsd: row.rateUsd.toString(),
        })),
    }));
    artistsHydratedFromInvoiceRef.current = lineItems.some((row) => row.section === "artist");
    artistsBootstrappedFromEventRef.current = false;
    baselineSignaturePendingRef.current = true;
    setInvoiceFieldsHydrated(true);
  }, [invoiceData, invoiceId]);

  useEffect(() => {
    if (!invoiceId) {
      crewBootstrappedRef.current = true;
    }
  }, [invoiceId]);

  useEffect(() => {
    if (invoiceId && !invoiceFieldsHydrated) return;
    if (crewBootstrappedRef.current) return;
    if (activeInvoiceId && linkedEvent === undefined && !linkedSeries) return;
    if (linkedSeries && seriesCostData === undefined) return;

    crewBootstrappedRef.current = true;

    if (linkedEvent && !linkedSeries) {
      // Crew lines for a single linked event come from the event schedule editor.
      // Hand-added hours don't: restore those now so the schedule merge keeps them.
      const manualRows = savedCrewSnapshotRef.current.filter((row) => row.source === "manual");
      if (manualRows.length) {
        setCrewRows((current) => [...current.filter((row) => row.source !== "manual"), ...manualRows]);
      }
      return;
    }

    if (savedCrewSnapshotRef.current.length) {
      setCrewRows(savedCrewSnapshotRef.current);
    }
  }, [invoiceId, invoiceFieldsHydrated, linkedEvent, linkedSeries, seriesCostData, activeInvoiceId, setCrewRows]);

  useEffect(() => {
    if (!invoiceFieldsHydrated) return;
    if (artistsHydratedFromInvoiceRef.current) return;
    if (artistsBootstrappedFromEventRef.current) return;
    if (!linkedEvent || linkedSeries) return;
    if (eventPerformers === undefined || bandsForArtists === undefined) return;

    artistsBootstrappedFromEventRef.current = true;
    if (eventPerformers.length === 0) return;

    const rateByOrg = new Map(bandsForArtists.map((band) => [band.organizationId, band.performerHourlyRateUsd]));
    const membersByOrg = new Map(bandsForArtists.map((band) => [band.organizationId, band.memberCount]));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap from event performers
    setSection(
      "artists",
      eventPerformers.map((performer) => {
        const payment = performer.payment;
        const eventId = performer.eventId;
        const needId = performer.needId ?? undefined;
        if (payment && payment.totalUsd > 0) {
          if (payment.pricingMode === "fixed_total") {
            return {
              organizationId: performer.organizationId,
              label: performer.bandName,
              hours: "1",
              people: "1",
              rateUsd: payment.totalUsd.toString(),
              eventId,
              needId,
            };
          }
          const hours = payment.performanceHours && payment.performanceHours > 0 ? payment.performanceHours : 1;
          const members = payment.memberCount && payment.memberCount > 0 ? payment.memberCount : 1;
          const rate = payment.ratePerMemberPerHourUsd ?? rateByOrg.get(performer.organizationId) ?? 0;
          return {
            organizationId: performer.organizationId,
            label: performer.bandName,
            hours: String(hours),
            people: String(members),
            rateUsd: rate.toString(),
            eventId,
            needId,
          };
        }
        const profileRate = rateByOrg.get(performer.organizationId) ?? 0;
        const profileMembers = membersByOrg.get(performer.organizationId) ?? 0;
        return {
          organizationId: performer.organizationId,
          label: performer.bandName,
          hours: "1",
          people: profileMembers > 0 ? profileMembers.toString() : "1",
          rateUsd: profileRate > 0 ? profileRate.toString() : "0",
          eventId,
          needId,
        };
      }),
    );
  }, [invoiceFieldsHydrated, linkedEvent, linkedSeries, eventPerformers, bandsForArtists, setSection]);

  // --- Host, contact, manager ---------------------------------------------

  function onManagerChange(userId: string) {
    const selected = (managerList ?? []).find((m) => m.id === userId);
    setFields((current) => ({
      ...current,
      managerUserId: userId,
      ...(selected ? { managerName: selected.name, managerEmail: selected.email ?? "" } : {}),
    }));
  }

  function onGroupChange(nextGroupId: string) {
    const selected = (groups ?? []).find((g) => g._id === nextGroupId);
    setFields((current) => ({
      ...current,
      groupId: nextGroupId,
      contactId: "",
      ...(selected
        ? {
            clientEmail: "",
            clientPhone: "",
            equipmentPricingMode: selected.equipmentPricingMode ?? "subsidized",
          }
        : {}),
    }));
  }

  function onContactChange(nextContactId: string) {
    const selected = (contacts ?? []).find((c) => c._id === nextContactId);
    setFields((current) => ({
      ...current,
      contactId: nextContactId,
      ...(selected ? { clientEmail: selected.email ?? "", clientPhone: selected.phone ?? "" } : {}),
    }));
  }

  // --- Payload, signature, totals -----------------------------------------

  function buildLineItems() {
    return buildInvoiceLineItems(lines, {
      packageNameById: (id) => packageById.get(id)?.name,
      typeLabelById: (id) => {
        const type = typeById.get(id);
        return type ? `${type.name} · ${type.model}` : undefined;
      },
      singleDayEventId: linkedDayEvents.length === 1 ? linkedDayEvents[0]!._id : undefined,
      crewRateMode: fields.crewRateMode,
      customCrewRateUsd: fields.customCrewRateUsd,
      settings,
    });
  }

  function buildPayload() {
    return buildInvoicePayload(fields, buildLineItems(), groups, contacts);
  }

  const draftSignature = useMemo(() => {
    const payload = buildPayload();
    return payload ? JSON.stringify(payload) : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately not on the catalog lookups; see the hook doc
  }, [fields, lines, groups, contacts]);

  const isDraftDirty =
    editorBaselineReady && invoiceFieldsHydrated && draftSignature !== "" && draftSignature !== lastSavedSignature;

  // Saving gives a new artist line its bill position on the server. Adopt that
  // id so the next save keeps the same position instead of opening another.
  const serverArtistNeeds = useMemo(
    () =>
      (invoiceData?.lineItems ?? [])
        .filter((row) => row.section === "artist" && row.needId)
        .sort((a, b) => a.order - b.order)
        .map((row) => ({
          needId: row.needId as string,
          key: artistLineKey(row.label, row.organizationId, row.eventId),
        })),
    [invoiceData?.lineItems],
  );
  const { artists } = lines;
  const serverLineItems = invoiceData?.lineItems;
  const serverArtistLines = useMemo(
    () => (serverLineItems ? serverArtistLinesByNeed(serverLineItems) : null),
    [serverLineItems],
  );
  useEffect(() => {
    if (!invoiceFieldsHydrated || !serverArtistLines) return;
    const before = serverArtistLinesRef.current;
    if (before === serverArtistLines) return;
    serverArtistLinesRef.current = serverArtistLines;
    if (!before) return;
    const next = adoptServerArtistChanges(artists, before, serverArtistLines);
    if (!next) return;
    // The server already has these values, so a clean draft stays clean.
    if (!isDraftDirty) baselineSignaturePendingRef.current = true;
    setSection("artists", next);
  }, [artists, invoiceFieldsHydrated, isDraftDirty, serverArtistLines, setSection]);

  useEffect(() => {
    // Only a clean draft: then every row was in the save that produced these
    // ids, and a row the user added since can't take over a removed row's slot.
    if (!invoiceFieldsHydrated || isDraftDirty || serverArtistNeeds.length === 0) return;
    const used = new Set(artists.map((row) => row.needId).filter(Boolean));
    const free = serverArtistNeeds.filter((need) => !used.has(need.needId));
    if (free.length === 0 || artists.every((row) => row.needId)) return;
    const singleDayEventId = linkedDayEvents.length === 1 ? linkedDayEvents[0]!._id : undefined;
    let adopted = false;
    const next = artists.map((row) => {
      if (row.needId) return row;
      // The same identity the save sent: label, act, and day.
      const key = artistLineKey(
        row.label,
        isTbdArtist(row) ? undefined : row.organizationId,
        row.eventId ?? singleDayEventId,
      );
      const index = free.findIndex((need) => need.key === key);
      if (index < 0) return row;
      const [need] = free.splice(index, 1);
      adopted = true;
      return { ...row, needId: need!.needId };
    });
    if (!adopted) return;
    // The id came from the save that made the draft clean, so it stays clean.
    baselineSignaturePendingRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopt server-assigned ids after a save
    setSection("artists", next);
  }, [artists, invoiceFieldsHydrated, isDraftDirty, linkedDayEvents, serverArtistNeeds, setSection]);

  useEffect(() => {
    if (!baselineSignaturePendingRef.current || !invoiceFieldsHydrated) return;
    if (invoiceId && linkedEvent === undefined && !linkedSeries) return;
    if (invoiceData?.invoice?.groupId && groups === undefined) return;
    if (fields.contactId && contacts === undefined) return;
    if (!crewBootstrappedRef.current) return;
    if (linkedEvent && !linkedSeries && !linkedEventCrewInitializedRef.current) return;
    if (linkedSeries && !linkedEventCrewInitializedRef.current) return;
    if (!linkedEvent && !linkedSeries && savedCrewSnapshotRef.current.length > 0 && lines.crewRows.length === 0) {
      return;
    }

    const payload = buildPayload();
    if (!payload) return;

    // One-time baseline establishment once all async dependencies (linked
    // event/series, groups, contacts, crew bootstrap) have settled, guarded
    // by baselineSignaturePendingRef so it never re-fires after that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastSavedSignature(JSON.stringify(payload));
    baselineSignaturePendingRef.current = false;
    setEditorBaselineReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildPayload is recreated each render; deps are its closed-over fields
  }, [invoiceFieldsHydrated, invoiceId, linkedEvent, linkedSeries, groups, contacts, fields, lines, invoiceData]);

  const draftTotals = useMemo(
    () =>
      computeInvoiceDraftTotals({
        equipmentPricingMode: fields.equipmentPricingMode,
        discountType: fields.discountType,
        discountValue: Number(fields.discountValue || "0"),
        billableOccurrenceCount,
        packages: packages ?? [],
        types: types ?? [],
        lineItems: buildLineItems().map((row) => ({
          section: row.section,
          quantity: row.quantity,
          rateUsd: row.rateUsd,
          equipmentQuantityBasis: row.equipmentQuantityBasis,
          packageId: row.packageId,
          typeId: row.typeId,
          excludedTypeIds: row.excludedTypeIds,
          packageExclusionDiscountUsd: row.packageExclusionDiscountUsd,
        })),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildLineItems is recreated each render; deps are its closed-over fields
    [fields, lines, billableOccurrenceCount, packages, types, settings],
  );

  const eventCostUsd =
    linkedSeries && seriesCostData?.costSummary
      ? seriesCostData.costSummary.projectedGrandTotalUsd
      : (linkedEvent?.crewCostUsd ?? 0) +
        (linkedEvent?.bandsCostUsd ?? 0) +
        (linkedEvent?.externalRentalsCostUsd ?? 0) +
        (linkedEvent?.otherCostUsd ?? 0);
  const eventPassThroughCostsUsd =
    linkedSeries && seriesCostData?.costSummary
      ? seriesCostData.costSummary.projectedPassThroughUsd
      : eventPassThroughCostUsd(linkedEvent?.bandsCostUsd ?? 0, linkedEvent?.externalRentalsCostUsd ?? 0);
  const invoicePassThroughSubtotalUsd = invoicePassThroughUsd(
    draftTotals.artistsSubtotalUsd,
    draftTotals.externalRentalsSubtotalUsd,
  );
  const profit = {
    billedUsd: arborEarnedRevenueUsd(draftTotals.totalUsd, invoicePassThroughSubtotalUsd),
    eventCostUsd: netProfitCostUsd(eventCostUsd, invoicePassThroughSubtotalUsd, eventPassThroughCostsUsd),
    netProfitUsd: netProfitFromInvoiceUsd(
      draftTotals.totalUsd,
      invoicePassThroughSubtotalUsd,
      eventCostUsd,
      eventPassThroughCostsUsd,
    ),
  };

  const savedTotalUsd = invoiceData?.invoice?.totalUsd;
  const pricingUnsaved = savedTotalUsd !== undefined && Math.abs(draftTotals.totalUsd - savedTotalUsd) > 0.009;

  const divisionWarnings = useMemo(
    () =>
      equipmentDivisionWarnings({
        billableOccurrenceCount,
        packages: lines.equipmentPackages
          .filter((row) => row.refId && Number(row.quantity) > 0)
          .map((row) => ({
            label: packageById.get(row.refId)?.name ?? "Package",
            quantity: Number(row.quantity),
            basis: row.basis,
          })),
        types: lines.equipmentTypes
          .filter((row) => row.refId && Number(row.quantity) > 0)
          .map((row) => {
            const type = typeById.get(row.refId);
            return {
              label: type ? `${type.name} · ${type.model}` : "Type",
              quantity: Number(row.quantity),
              basis: row.basis,
            };
          }),
      }),
    [billableOccurrenceCount, lines.equipmentPackages, lines.equipmentTypes, packageById, typeById],
  );

  const seriesOccurrenceStale = Boolean(
    editorBaselineReady &&
      linkedSeries &&
      invoiceData?.invoice?.billableOccurrenceCountAtSave != null &&
      billableOccurrenceCount !== invoiceData.invoice.billableOccurrenceCountAtSave,
  );

  const defaultEquipmentBasis: EquipmentRow["basis"] = linkedSeries ? "per_occurrence" : "total";

  // --- Saving ---------------------------------------------------------------

  async function scaffoldPullListsForLinkedDays() {
    const dayIds =
      linkedDayEvents.length > 0 ? linkedDayEvents.map((day) => day._id) : linkedEvent ? [linkedEvent._id] : [];
    for (const eventId of dayIds) {
      await scaffoldPullListFromInvoice({ eventId });
    }
  }

  function setSaveError(error: string | null) {
    setSaveState((current) => ({ ...current, error }));
  }

  /**
   * Save the draft. A change to an approved quote goes to the server without a
   * decision first: if it only touches things the client didn't approve
   * (manager, contact, notes) it just saves; otherwise the server refuses and
   * the approved-change dialog opens, which calls back with `approvedChange`.
   * Nothing is written until that decision is made.
   */
  async function persistDraft(promptForPullListSync = false, approvedChange?: ApprovedChange) {
    const payload = buildPayload();
    if (!payload) {
      setSaveState({ status: "error", error: "Select a manager and add at least one line item." });
      return false;
    }

    let signature = JSON.stringify(payload);
    const requestId = ++saveRequestIdRef.current;
    setSaving(true);
    setSaveState({ status: "saving", error: null });

    try {
      if (activeInvoiceId) {
        const result = await updateDraft({
          id: activeInvoiceId,
          ...payload,
          ...(approvedChange ? { approvedChange } : {}),
        });
        if (result.warning) notify.warning(result.warning);
        if (result.appliedDiscount) {
          // The server set the discount that keeps the approved total: adopt it,
          // so the editor matches what was saved instead of reading as dirty.
          const { discountType, discountValue } = result.appliedDiscount;
          setFields((current) => ({ ...current, discountType, discountValue: String(discountValue) }));
          signature = JSON.stringify({ ...payload, discountType, discountValue });
        }
        if (result.revision?.kind === "reapproval_requested") {
          notify.success(`Saved as version ${result.revision.number} and sent to the client for re-approval.`);
        } else if (result.revision?.kind === "matched_approval" && result.appliedDiscount) {
          notify.success(
            `Saved as version ${result.revision.number} with a $${result.appliedDiscount.discountValue.toFixed(2)} discount. The approved total stands.`,
          );
        } else if (result.revision?.kind === "change_kept_approval") {
          notify.success(`Saved as version ${result.revision.number}. The client's approval stands.`);
        }
      } else {
        const result = await createDraft(payload);
        setActiveInvoiceId(result.id);
        setApprovalToken(result.publicApprovalToken ?? "");
        router.replace(`/dashboard/financial-hub/invoices/${result.id}`);
      }
      setLastSavedSignature(signature);
      if (requestId === saveRequestIdRef.current) {
        setSaveState({ status: "saved", error: null });
      }
    } catch (error) {
      if (!approvedChange && getConvexAppErrorData(error)?.code === "QUOTE_APPROVED_CHANGE_NEEDS_DECISION") {
        if (requestId === saveRequestIdRef.current) setSaveState({ status: "idle", error: null });
        setApprovedChangeOpen(true);
        return false;
      }
      const message = getConvexErrorMessage(error, "Could not save invoice.");
      if (requestId === saveRequestIdRef.current) {
        setSaveState({ status: "error", error: message });
      }
      return false;
    } finally {
      setSaving(false);
    }

    // Pull-list sync is best-effort after a successful save. Do not roll the
    // invoice save back into an error state if scaffolding fails.
    if (promptForPullListSync && activeInvoiceId && linkedEvent && !linkedSeries) {
      try {
        const status = await convex.query(api.eventPullLists.getInvoiceSyncStatus, {
          eventId: linkedEvent._id,
        });
        if (status.hasInvoice && status.inSync === false) {
          const shouldResync = await confirm({
            title: "Update the pull list?",
            description:
              "This invoice's equipment lines no longer match the event's pull list. Update the pull list to match?",
          });
          if (shouldResync) {
            await scaffoldPullListsForLinkedDays();
            if (requestId === saveRequestIdRef.current) {
              notify.success("Invoice saved and pull list resynced.");
            }
          }
        }
      } catch (error) {
        const message = getConvexErrorMessage(error, "Could not sync the pull list.");
        notify.error(message);
        if (requestId === saveRequestIdRef.current) {
          setSaveError(message);
        }
      }
    }

    return true;
  }

  // Autosave only while the quote is an unsent draft. Once the client can see
  // it (sent, or approved), every change is an explicit save.
  const invoiceDoc = invoiceData?.invoice;
  const autosaveEnabled = Boolean(
    invoiceDoc &&
      invoiceDoc.status === "draft" &&
      (invoiceDoc.clientApprovalStatus ?? "pending") !== "approved" &&
      !invoiceDoc.clientReviewReadyAt,
  );

  useEffect(() => {
    if (!autosaveEnabled) return;
    if (!activeInvoiceId || !invoiceFieldsHydrated || !editorBaselineReady || !isDraftDirty) return;
    if (saving || saveState.status === "saving") return;
    const timer = window.setTimeout(() => {
      void persistDraft();
    }, 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistDraft is recreated each render; draftSignature covers content changes
  }, [draftSignature, autosaveEnabled, activeInvoiceId, invoiceFieldsHydrated, editorBaselineReady, isDraftDirty, saving, saveState.status]);

  return {
    invoiceId,
    activeInvoiceId,
    invoiceData,
    invoice: invoiceData?.invoice,

    // Linked event / series
    linkedEvent,
    linkedSeries,
    linkedDayEvents,
    otherLinkedEvents,
    seriesCostData,
    billableOccurrenceCount,
    selectedDayEventId,
    selectDay: setSelectedDayEventIdOverride,
    pullListSyncStatus,
    scaffoldPullListsForLinkedDays,

    // Catalogs
    settings,
    groups,
    contacts,
    managerList,
    managerOptions,
    bandsForArtists,
    packageById,
    typeById,

    // Draft
    fields,
    setField,
    lines,
    setSection,
    setCrewRows,
    setManualCrewRows,
    handleEventCrewRowsChange,
    handleSeriesShiftDraftsChange,
    invalidateCrewBuckets,
    dueDateTouched,
    setDueDateTouched,
    approvalToken,
    setApprovalToken,
    onManagerChange,
    onGroupChange,
    onContactChange,
    defaultCrewHourlyRateUsd,
    defaultEquipmentBasis,

    // Derived
    draftTotals,
    profit,
    pricingUnsaved,
    divisionWarnings,
    seriesOccurrenceStale,

    // Saving
    isDraftDirty,
    saving,
    saveStatus: saveState.status,
    saveError: saveState.error,
    setSaveError,
    persistDraft,
    buildPayload,
    autosaveEnabled,
    approvedChangeOpen,
    setApprovedChangeOpen,
  };
}

export type InvoiceDraft = ReturnType<typeof useInvoiceDraft>;
