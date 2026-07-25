"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { AdminCascadeDeleteDialog } from "@/components/admin/admin-cascade-delete-dialog";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import {
  InventoryPackageSearchSelect,
  InventoryTypeSearchSelect,
} from "@/components/inventory/inventory-search-select";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { InvoiceQuoteApprovalDetails } from "@/components/financial/invoice-quote-approval-details";
import { InvoicePaymentStatusSection } from "@/components/financial/invoice-payment-status-section";
import { InvoiceLinkedEventCrewSection } from "@/components/financial/invoice-linked-event-crew";
import { EventSeriesShiftEditor } from "@/components/events/event-series-shift-editor";
import {
  buildInvoiceCrewRowsFromShiftTemplateDrafts,
  mergeEventCrewWithManualRows,
  type InvoiceCrewRow,
} from "@/lib/invoice-crew-from-event";
import type { SeriesShiftTemplateDraft } from "@/lib/event-series-shifts";
import { CaretDownIcon } from "@phosphor-icons/react";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { FormSaveBar } from "@/components/forms";
import { computeInvoiceDraftTotals } from "@/lib/compute-invoice-draft-totals";
import { equipmentDivisionWarnings } from "@/lib/equipment-division-warnings";
import { InvoicePdfDownloadButton } from "@/components/financial/invoice-pdf-download-button";

type EquipmentRow = { refId: string; quantity: string; basis?: "total" | "per_occurrence" };
type ExternalRentalRow = { provider: string; label: string; quantity: string; rateUsd: string };
type ArtistRow = { label: string; quantity: string; rateUsd: string };
type CrewRow = InvoiceCrewRow;
type FeeRow = { feeDefinitionId: string; label: string; quantity: string; rateUsd: string };

import {
  INVOICE_GROUP_TYPE_LABELS,
  EQUIPMENT_PRICING_MODE_OPTIONS,
  type EquipmentPricingMode,
} from "@/lib/invoice-group-labels";
import { formatContactFullName, splitContactName } from "@/lib/contact-name";
import { formatDateTime, formatDateTimeRange, formatUsd } from "@/lib/format";

export function InvoiceEditor({
  invoiceId,
  initialIssueDate,
}: {
  invoiceId?: Id<"invoices">;
  initialIssueDate?: string;
}) {
  const router = useRouter();
  const viewer = useSessionViewer();
  const [groupId, setGroupId] = useState("");
  const [contactId, setContactId] = useState("");
  const session = authClient.useSession();
  const managerList = useQuery(api.invoices.listManagers, {});
  const groups = useQuery(api.invoiceGroups.list, { activeOnly: true });
  const settings = useQuery(api.invoiceSettings.get, {});
  const invoiceData = useQuery(api.invoices.get, invoiceId ? { id: invoiceId } : "skip");
  const contacts = useQuery(api.invoiceContacts.list, {
    activeOnly: true,
    ...(groupId ? { groupId: groupId as Id<"invoiceGroups"> } : {}),
  });

  const createDraft = useMutation(api.invoices.createDraft);
  const duplicateInvoice = useMutation(api.invoices.duplicate);
  const updateDraft = useMutation(api.invoices.updateDraft);
  const recalculateSeriesEquipmentLines = useMutation(api.invoices.recalculateSeriesEquipmentLines);
  const markReadyForClientReview = useMutation(api.invoices.markReadyForClientReview);
  const withdrawFromClientReview = useMutation(api.invoices.withdrawFromClientReview);
  const regeneratePublicApprovalToken = useMutation(api.invoices.regeneratePublicApprovalToken);
  const resetApprovalToPending = useMutation(api.invoices.resetApprovalToPending);
  const createGroup = useMutation(api.invoiceGroups.create);
  const createContact = useMutation(api.invoiceContacts.create);
  const deleteInvoiceAdmin = useMutation(api.adminDeletes.deleteInvoiceAdmin);

  const [issueDate, setIssueDate] = useState(initialIssueDate ?? "");
  const [dueDate, setDueDate] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddressLine1, setClientAddressLine1] = useState("");
  const [clientAddressLine2, setClientAddressLine2] = useState("");
  const [clientCity, setClientCity] = useState("");
  const [clientState, setClientState] = useState("");
  const [clientPostalCode, setClientPostalCode] = useState("");
  const [equipmentPricingMode, setEquipmentPricingMode] = useState<"subsidized" | "nonSubsidized">("nonSubsidized");
  const [crewRateMode, setCrewRateMode] = useState<"normal" | "lead" | "custom">("normal");
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [equipmentPackages, setEquipmentPackages] = useState<EquipmentRow[]>([{ refId: "", quantity: "1" }]);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentRow[]>([{ refId: "", quantity: "1" }]);
  const [externalRentals, setExternalRentals] = useState<ExternalRentalRow[]>([]);
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [crewRows, setCrewRows] = useState<CrewRow[]>([]);
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [feesCatalogEnabled, setFeesCatalogEnabled] = useState(false);
  const [termsCatalogEnabled, setTermsCatalogEnabled] = useState(false);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<Id<"invoices"> | undefined>(invoiceId);
  const pdfExports = useQuery(
    api.invoicePdf.listExports,
    activeInvoiceId ? { invoiceId: activeInvoiceId } : "skip",
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const linkedEvent = useQuery(
    api.events.getByInvoiceId,
    activeInvoiceId ? { invoiceId: activeInvoiceId } : "skip",
  );
  const linkedSeries = invoiceData?.series ?? linkedEvent?.series ?? null;
  const billableOccurrenceCount = linkedSeries?.activeOccurrenceCount ?? 0;
  const seriesCostData = useQuery(
    api.eventSeries.get,
    linkedSeries?.seriesId ? { id: linkedSeries.seriesId } : "skip",
  );
  const sourceRequest = useQuery(
    api.eventRequests.getByLinkedInvoiceId,
    activeInvoiceId ?? invoiceId ? { invoiceId: (activeInvoiceId ?? invoiceId)! } : "skip",
  );
  const deletePreview = useQuery(
    api.adminDeletes.previewInvoiceDeletion,
    deleteOpen && (activeInvoiceId ?? invoiceId) ? { id: (activeInvoiceId ?? invoiceId)! } : "skip",
  );
  const isAdmin = viewer?.isAdmin ?? false;
  const [approvalToken, setApprovalToken] = useState("");
  const [termsIds, setTermsIds] = useState<Id<"invoiceTerms">[]>([]);
  const [additionalTermsMarkdown, setAdditionalTermsMarkdown] = useState("");
  const feeDefinitions = useQuery(
    api.invoiceFeeDefinitions.list,
    feesCatalogEnabled || fees.some((row) => row.feeDefinitionId) ? { activeOnly: true } : "skip",
  );
  const termsDefinitions = useQuery(
    api.invoiceTerms.list,
    termsCatalogEnabled || termsIds.length > 0 ? { activeOnly: true } : "skip",
  );
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState<"vso" | "house" | "department" | "individual">("department");
  const [newGroupEquipmentPricingMode, setNewGroupEquipmentPricingMode] =
    useState<EquipmentPricingMode>("subsidized");
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [newContactLastName, setNewContactLastName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  const [lastSavedSignature, setLastSavedSignature] = useState("");
  const saveRequestIdRef = useRef(0);
  const hasHydratedFromServerRef = useRef(false);
  const crewBootstrappedRef = useRef(false);
  const linkedEventCrewInitializedRef = useRef(false);
  const baselineSignaturePendingRef = useRef(false);
  const savedCrewSnapshotRef = useRef<CrewRow[]>([]);
  const [invoiceFieldsHydrated, setInvoiceFieldsHydrated] = useState(() => !invoiceId);
  const [editorBaselineReady, setEditorBaselineReady] = useState(() => !invoiceId);
  const reapprovalDecisionRef = useRef<null | boolean>(null);

  const managerOptions = useMemo(
    () =>
      (managerList ?? []).map((entry) => ({
        value: entry.id,
        label: entry.email ? `${entry.name} (${entry.email})` : entry.name,
      })),
    [managerList],
  );

  const selectedPackageIds = useMemo(
    () =>
      equipmentPackages
        .map((row) => row.refId)
        .filter((id): id is string => Boolean(id)) as Id<"inventoryPackages">[],
    [equipmentPackages],
  );
  const selectedTypeIds = useMemo(
    () =>
      equipmentTypes
        .map((row) => row.refId)
        .filter((id): id is string => Boolean(id)) as Id<"inventoryTypes">[],
    [equipmentTypes],
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

  const groupOptions = useMemo(
    () =>
      (groups ?? []).map((g) => ({
        value: g._id,
        label: `${g.name} (${INVOICE_GROUP_TYPE_LABELS[g.type] ?? g.type})`,
      })),
    [groups],
  );
  const selectedGroup = useMemo(
    () => (groups ?? []).find((group) => group._id === groupId),
    [groups, groupId],
  );
  const contactOptions = useMemo(
    () =>
      (contacts ?? []).map((c) => {
        const fullName = formatContactFullName(c.firstName, c.lastName);
        return {
          value: c._id,
          label: c.email ? `${fullName} (${c.email})` : fullName,
        };
      }),
    [contacts],
  );

  const defaultCrewHourlyRateUsd = useMemo(() => {
    if (crewRateMode === "lead") {
      return settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd ?? settings?.crewNormalRateUsd ?? 0;
    }
    if (crewRateMode === "custom") {
      return settings?.crewNormalRateUsd ?? 0;
    }
    return settings?.crewNormalRateUsd ?? 0;
  }, [crewRateMode, settings]);

  const handleEventCrewRowsChange = useCallback((eventRows: InvoiceCrewRow[]) => {
    if (!crewBootstrappedRef.current) return;
    linkedEventCrewInitializedRef.current = true;
    setCrewRows((current) => mergeEventCrewWithManualRows(eventRows, current));
  }, []);

  const setManualCrewRows = useCallback((updater: SetStateAction<CrewRow[]>) => {
    setCrewRows((current) => {
      const eventRows = current.filter((row) => row.source === "event");
      const prevManual = current.filter((row) => row.source === "manual");
      const nextManual = typeof updater === "function" ? updater(prevManual) : updater;
      return [
        ...eventRows,
        ...nextManual.map((row) => ({ ...row, source: "manual" as const })),
      ];
    });
  }, []);

  useEffect(() => {
    if (!managerUserId && session.data?.user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setManagerUserId(session.data.user.id);
      setManagerName(session.data.user.name ?? "");
      setManagerEmail(session.data.user.email ?? "");
    }
  }, [managerUserId, session.data?.user?.id, session.data?.user?.name, session.data?.user?.email]);

  useEffect(() => {
    if (issueDate) return;
    if (invoiceId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIssueDate(new Date().toISOString().slice(0, 10));
  }, [issueDate, invoiceId]);

  useEffect(() => {
    hasHydratedFromServerRef.current = false;
    crewBootstrappedRef.current = false;
    linkedEventCrewInitializedRef.current = false;
    baselineSignaturePendingRef.current = false;
    savedCrewSnapshotRef.current = [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    // New invoices have no server hydrate step — treat empty defaults as hydrated so
    // FormSaveBar dirty tracking works on /invoices/new.
    setInvoiceFieldsHydrated(!invoiceId);
    setEditorBaselineReady(!invoiceId);
  }, [invoiceId]);

  useEffect(() => {
    if (!invoiceData || !invoiceId) return;
    if (invoiceData.invoice._id !== invoiceId) return;
    if (hasHydratedFromServerRef.current) return;

    const { invoice, lineItems } = invoiceData;
    hasHydratedFromServerRef.current = true;
    setActiveInvoiceId(invoice._id);
    setApprovalToken(invoice.publicApprovalToken ?? "");
    setIssueDate(invoice.issueDate);
    setDueDate(invoice.dueDate ?? "");
    setManagerUserId(invoice.managerUserId);
    setManagerName(invoice.managerName);
    setManagerEmail(invoice.managerEmail ?? "");
    setGroupId(invoice.groupId ?? "");
    setContactId(invoice.contactId ?? "");
    setClientEmail(invoice.clientEmail ?? "");
    setClientPhone(invoice.clientPhone ?? "");
    setClientAddressLine1(invoice.clientAddressLine1 ?? "");
    setClientAddressLine2(invoice.clientAddressLine2 ?? "");
    setClientCity(invoice.clientCity ?? "");
    setClientState(invoice.clientState ?? "");
    setClientPostalCode(invoice.clientPostalCode ?? "");
    setEquipmentPricingMode(invoice.equipmentPricingMode);
    setCrewRateMode(invoice.crewRateMode === "ot" ? "lead" : invoice.crewRateMode);
    setDiscountType(invoice.discountType);
    setDiscountValue(invoice.discountValue.toString());
    setNotes(invoice.notes ?? "");
    setTermsIds(
      invoice.termsIds?.length
        ? invoice.termsIds
        : invoice.termsId
          ? [invoice.termsId]
          : [],
    );
    setAdditionalTermsMarkdown(invoice.additionalTermsMarkdown ?? "");

    setEquipmentPackages(
      lineItems
        .filter((row) => row.section === "equipment_package")
        .map((row) => ({
          refId: row.packageId ?? "",
          quantity: row.quantity.toString(),
          basis: row.equipmentQuantityBasis ?? "total",
        })) || [{ refId: "", quantity: "1", basis: "total" }],
    );
    setEquipmentTypes(
      lineItems
        .filter((row) => row.section === "equipment_type")
        .map((row) => ({
          refId: row.typeId ?? "",
          quantity: row.quantity.toString(),
          basis: row.equipmentQuantityBasis ?? "total",
        })) || [{ refId: "", quantity: "1", basis: "total" }],
    );
    setExternalRentals(
      lineItems
        .filter((row) => row.section === "external_rental")
        .map((row) => ({
          provider: row.provider ?? "",
          label: row.label,
          quantity: row.quantity.toString(),
          rateUsd: row.rateUsd.toString(),
        })),
    );
    setArtists(
      lineItems
        .filter((row) => row.section === "artist")
        .map((row) => ({ label: row.label, quantity: row.quantity.toString(), rateUsd: row.rateUsd.toString() })),
    );
    const savedCrewRows = lineItems.filter((row) => row.section === "crew");
    savedCrewSnapshotRef.current = savedCrewRows.map((row) => ({
      label: row.label,
      quantity: row.quantity.toString(),
      rateUsd: row.rateUsd.toString(),
    }));
    setFees(
      lineItems
        .filter((row) => row.section === "fee")
        .map((row) => ({
          feeDefinitionId: row.feeDefinitionId ?? "",
          label: row.label,
          quantity: row.quantity.toString(),
          rateUsd: row.rateUsd.toString(),
        })),
    );
    reapprovalDecisionRef.current = null;
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
      return;
    }

    if (savedCrewSnapshotRef.current.length) {
      setCrewRows(savedCrewSnapshotRef.current);
    }
  }, [invoiceId, invoiceFieldsHydrated, linkedEvent, linkedSeries, seriesCostData, activeInvoiceId]);

  function onManagerChange(userId: string) {
    setManagerUserId(userId);
    const selected = (managerList ?? []).find((m) => m.id === userId);
    if (selected) {
      setManagerName(selected.name);
      setManagerEmail(selected.email ?? "");
    }
  }

  function onGroupChange(nextGroupId: string) {
    setGroupId(nextGroupId);
    setContactId("");
    const selected = (groups ?? []).find((g) => g._id === nextGroupId);
    if (selected) {
      setClientEmail("");
      setClientPhone("");
      setEquipmentPricingMode(selected.equipmentPricingMode ?? "subsidized");
    }
  }

  function onContactChange(nextContactId: string) {
    setContactId(nextContactId);
    const selected = (contacts ?? []).find((c) => c._id === nextContactId);
    if (selected) {
      setClientEmail(selected.email ?? "");
      setClientPhone(selected.phone ?? "");
    }
  }

  function openCreateGroup(prefill: string) {
    setNewGroupName(prefill);
    setGroupModalOpen(true);
  }

  async function submitCreateGroup() {
    if (!newGroupName.trim()) return;
    const id = await createGroup({
      name: newGroupName.trim(),
      type: newGroupType,
      equipmentPricingMode: newGroupEquipmentPricingMode,
      active: true,
    });
    setGroupModalOpen(false);
    onGroupChange(id);
    setNewGroupName("");
  }

  function openCreateContact(prefill: string) {
    if (!groupId) {
      window.alert("Select a host first so the client/contact can be linked.");
      return;
    }
    const { firstName, lastName } = splitContactName(prefill);
    setNewContactFirstName(firstName);
    setNewContactLastName(lastName);
    setContactModalOpen(true);
  }

  async function submitCreateContact() {
    if (!groupId) {
      window.alert("Select a host first.");
      return;
    }
    if (!newContactFirstName.trim() || !newContactLastName.trim()) return;
    const id = await createContact({
      groupId: groupId as Id<"invoiceGroups">,
      firstName: newContactFirstName.trim(),
      lastName: newContactLastName.trim(),
      email: newContactEmail.trim() || undefined,
      phone: newContactPhone.trim() || undefined,
      active: true,
    });
    setContactModalOpen(false);
    onContactChange(id);
    setNewContactFirstName("");
    setNewContactLastName("");
    setNewContactEmail("");
    setNewContactPhone("");
  }

  function buildLineItems() {
    let order = 0;
    const rows: Array<{
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
      equipmentQuantityBasis?: "total" | "per_occurrence";
    }> = [];
    for (const row of equipmentPackages) {
      if (!row.refId || Number(row.quantity) <= 0) continue;
      const pkg = packageById.get(row.refId);
      rows.push({
        section: "equipment_package",
        order: order++,
        label: pkg?.name ?? "Package",
        quantity: Number(row.quantity),
        rateUsd: 0,
        packageId: row.refId as Id<"inventoryPackages">,
        equipmentQuantityBasis: row.basis ?? "total",
      });
    }
    for (const row of equipmentTypes) {
      if (!row.refId || Number(row.quantity) <= 0) continue;
      const type = typeById.get(row.refId);
      rows.push({
        section: "equipment_type",
        order: order++,
        label: type ? `${type.name} · ${type.model}` : "Type",
        quantity: Number(row.quantity),
        rateUsd: 0,
        typeId: row.refId as Id<"inventoryTypes">,
        equipmentQuantityBasis: row.basis ?? "total",
      });
    }
    for (const row of externalRentals) {
      if (!row.label.trim() || Number(row.quantity) <= 0) continue;
      rows.push({
        section: "external_rental",
        order: order++,
        provider: row.provider.trim() || undefined,
        label: row.label.trim(),
        quantity: Number(row.quantity),
        rateUsd: Number(row.rateUsd || "0"),
      });
    }
    for (const row of artists) {
      if (!row.label.trim() || Number(row.quantity) <= 0) continue;
      rows.push({
        section: "artist",
        order: order++,
        label: row.label.trim(),
        quantity: Number(row.quantity),
        rateUsd: Number(row.rateUsd || "0"),
      });
    }
    for (const row of crewRows) {
      if (!row.label.trim() || Number(row.quantity) <= 0) continue;
      const derivedCrewRate =
        crewRateMode === "custom"
          ? Number(row.rateUsd || "0")
          : crewRateMode === "lead"
            ? (settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd ?? settings?.crewNormalRateUsd ?? 0)
            : (settings?.crewNormalRateUsd ?? 0);
      rows.push({
        section: "crew",
        order: order++,
        label: row.label.trim(),
        quantity: Number(row.quantity),
        rateUsd: derivedCrewRate,
      });
    }
    for (const row of fees) {
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

  function buildPayload() {
    if (!managerUserId || !managerName.trim()) return null;
    const lineItems = buildLineItems();
    if (!lineItems.length) return null;
    const hostGroup = (groups ?? []).find((group) => group._id === groupId);
    const hostContact = (contacts ?? []).find((contact) => contact._id === contactId);
    return {
      issueDate,
      dueDate: dueDate || undefined,
      managerUserId,
      managerName,
      managerEmail: managerEmail || undefined,
      groupId: groupId ? (groupId as Id<"invoiceGroups">) : undefined,
      contactId: contactId ? (contactId as Id<"invoiceContacts">) : undefined,
      clientGroupName: hostGroup?.name,
      clientGroupType: hostGroup?.type,
      clientContactName: hostContact
        ? formatContactFullName(hostContact.firstName, hostContact.lastName)
        : undefined,
      clientEmail: clientEmail || undefined,
      clientPhone: clientPhone || undefined,
      clientAddressLine1: clientAddressLine1 || undefined,
      clientAddressLine2: clientAddressLine2 || undefined,
      clientCity: clientCity || undefined,
      clientState: clientState || undefined,
      clientPostalCode: clientPostalCode || undefined,
      equipmentPricingMode,
      crewRateMode,
      discountType,
      discountValue: Number(discountValue || "0"),
      notes: notes || undefined,
      termsIds: termsIds.length ? termsIds : undefined,
      additionalTermsMarkdown: additionalTermsMarkdown || undefined,
      lineItems,
    };
  }

  async function persistDraft() {
    const payload = buildPayload();
    if (!payload) {
      setAutoSaveState("error");
      setAutoSaveError("Select a manager and add at least one line item.");
      return false;
    }

    const signature = JSON.stringify(payload);
    const approvedQuoteEdited =
      invoiceData?.invoice?.clientApprovalStatus === "approved" &&
      signature !== lastSavedSignature;

    if (approvedQuoteEdited && reapprovalDecisionRef.current === null) {
      reapprovalDecisionRef.current = window.confirm(
        "This quote was already approved and has changed. Require client approval again?",
      );
    }

    const requestId = ++saveRequestIdRef.current;
    setSaving(true);
    setSaveMessage(null);
    setAutoSaveState("saving");
    setAutoSaveError(null);
    setSaveWarning(null);

    try {
      if (activeInvoiceId) {
        const result = await updateDraft({ id: activeInvoiceId, ...payload });
        setSaveWarning(result.warning ?? null);
        if (approvedQuoteEdited && reapprovalDecisionRef.current) {
          await resetApprovalToPending({ id: activeInvoiceId });
          setSaveMessage("Quote updated and reset to pending approval.");
        }
      } else {
        const result = await createDraft(payload);
        setActiveInvoiceId(result.id);
        setApprovalToken(result.publicApprovalToken ?? "");
        router.replace(`/dashboard/financial-hub/invoices/${result.id}`);
      }
      setLastSavedSignature(signature);
      if (requestId === saveRequestIdRef.current) {
        setSaveMessage("Invoice saved.");
        setAutoSaveState("saved");
      }
      return true;
    } catch (error) {
      const message = getConvexErrorMessage(error, "Could not save invoice.");
      if (requestId === saveRequestIdRef.current) {
        setAutoSaveState("error");
        setAutoSaveError(message);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function regenerateToken() {
    if (!activeInvoiceId) return;
    if (!window.confirm("Regenerate the public quote token? Old links will stop working.")) return;
    const result = await regeneratePublicApprovalToken({ id: activeInvoiceId });
    setApprovalToken(result.token);
    setSaveMessage("Public quote link regenerated.");
  }

  async function markReadyOnRequestPortal() {
    if (!activeInvoiceId) return;
    await markReadyForClientReview({ id: activeInvoiceId });
    setSaveMessage("Quote is ready for client review on the request portal.");
  }

  async function withdrawFromRequestPortal() {
    if (!activeInvoiceId) return;
    await withdrawFromClientReview({ id: activeInvoiceId });
    setSaveMessage("Quote withdrawn from the request portal for editing.");
  }

  const draftSignature = useMemo(() => {
    const payload = buildPayload();
    return payload ? JSON.stringify(payload) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- buildPayload is recreated each render; deps are its closed-over fields
  }, [
    issueDate,
    dueDate,
    managerUserId,
    managerName,
    managerEmail,
    groupId,
    contactId,
    clientEmail,
    clientPhone,
    clientAddressLine1,
    clientAddressLine2,
    clientCity,
    clientState,
    clientPostalCode,
    equipmentPricingMode,
    crewRateMode,
    discountType,
    discountValue,
    notes,
    termsIds,
    additionalTermsMarkdown,
    equipmentPackages,
    equipmentTypes,
    externalRentals,
    artists,
    crewRows,
    fees,
    groups,
    contacts,
  ]);

  const isDraftDirty =
    editorBaselineReady &&
    invoiceFieldsHydrated &&
    draftSignature !== "" &&
    draftSignature !== lastSavedSignature;

  useEffect(() => {
    if (!baselineSignaturePendingRef.current || !invoiceFieldsHydrated) return;
    if (invoiceId && linkedEvent === undefined && !linkedSeries) return;
    if (invoiceData?.invoice?.groupId && groups === undefined) return;
    if (contactId && contacts === undefined) return;
    if (!crewBootstrappedRef.current) return;
    if (linkedEvent && !linkedSeries && !linkedEventCrewInitializedRef.current) return;
    if (linkedSeries && !linkedEventCrewInitializedRef.current) return;
    if (!linkedEvent && !linkedSeries && savedCrewSnapshotRef.current.length > 0 && crewRows.length === 0) return;

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
  }, [
    invoiceFieldsHydrated,
    invoiceId,
    linkedEvent,
    linkedSeries,
    groups,
    contacts,
    contactId,
    crewRows,
    issueDate,
    dueDate,
    managerUserId,
    managerName,
    managerEmail,
    groupId,
    clientEmail,
    clientPhone,
    clientAddressLine1,
    clientAddressLine2,
    clientCity,
    clientState,
    clientPostalCode,
    equipmentPricingMode,
    crewRateMode,
    discountType,
    discountValue,
    notes,
    termsIds,
    additionalTermsMarkdown,
    equipmentPackages,
    equipmentTypes,
    externalRentals,
    artists,
    fees,
    invoiceData,
  ]);

  const linkedEvents = linkedEvent?.linkedEvents ?? [];

  const handleSeriesShiftDraftsChange = useCallback(
    (drafts: SeriesShiftTemplateDraft[]) => {
      if (!crewBootstrappedRef.current) return;
      if (!seriesCostData?.series?.blockTemplates) return;
      linkedEventCrewInitializedRef.current = true;
      const eventRows = buildInvoiceCrewRowsFromShiftTemplateDrafts({
        drafts,
        blockTemplates: seriesCostData.series.blockTemplates,
        billableOccurrenceCount,
      });
      setCrewRows((current) => mergeEventCrewWithManualRows(eventRows, current));
    },
    [seriesCostData, billableOccurrenceCount],
  );

  const draftTotals = useMemo(() => {
    const lineItems = buildLineItems();
    return computeInvoiceDraftTotals({
      equipmentPricingMode,
      discountType,
      discountValue: Number(discountValue || "0"),
      billableOccurrenceCount,
      packages: packages ?? [],
      types: types ?? [],
      lineItems: lineItems.map((row) => ({
        section: row.section,
        quantity: row.quantity,
        rateUsd: row.rateUsd,
        equipmentQuantityBasis: row.equipmentQuantityBasis,
        packageId: row.packageId,
        typeId: row.typeId,
      })),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- buildLineItems is recreated each render; deps are its closed-over fields
  }, [
    equipmentPricingMode,
    discountType,
    discountValue,
    billableOccurrenceCount,
    packages,
    types,
    equipmentPackages,
    equipmentTypes,
    externalRentals,
    artists,
    crewRows,
    fees,
    crewRateMode,
    settings,
  ]);

  const savedTotalUsd = invoiceData?.invoice?.totalUsd;
  const pricingUnsaved =
    savedTotalUsd !== undefined && Math.abs(draftTotals.totalUsd - savedTotalUsd) > 0.009;

  const divisionWarnings = useMemo(() => {
    return equipmentDivisionWarnings({
      billableOccurrenceCount,
      packages: equipmentPackages
        .filter((row) => row.refId && Number(row.quantity) > 0)
        .map((row) => ({
          label: packageById.get(row.refId)?.name ?? "Package",
          quantity: Number(row.quantity),
          basis: row.basis,
        })),
      types: equipmentTypes
        .filter((row) => row.refId && Number(row.quantity) > 0)
        .map((row) => {
          const type = typeById.get(row.refId);
          return {
            label: type ? `${type.name} · ${type.model}` : "Type",
            quantity: Number(row.quantity),
            basis: row.basis,
          };
        }),
    });
  }, [billableOccurrenceCount, equipmentPackages, equipmentTypes, packageById, typeById]);

  const seriesOccurrenceStale =
    editorBaselineReady &&
    linkedSeries &&
    invoiceData?.invoice?.billableOccurrenceCountAtSave != null &&
    billableOccurrenceCount !== invoiceData.invoice.billableOccurrenceCountAtSave;

  const defaultEquipmentBasis: EquipmentRow["basis"] = linkedSeries ? "per_occurrence" : "total";

  useEffect(() => {
    if (!activeInvoiceId || !invoiceFieldsHydrated || !editorBaselineReady || !isDraftDirty) return;
    if (saving || autoSaveState === "saving") return;
    const timer = window.setTimeout(() => {
      void persistDraft();
    }, 2500);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- persistDraft is recreated each render; draftSignature covers content changes
  }, [draftSignature, activeInvoiceId, invoiceFieldsHydrated, editorBaselineReady, isDraftDirty, saving, autoSaveState]);

  const isRequestLinkedQuote = Boolean(invoiceData?.invoice?.sourceEventRequestId);
  const requestPortalReady = Boolean(invoiceData?.invoice?.clientReviewReadyAt);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const requestPortalUrl =
    sourceRequest?.publicToken && origin
      ? `${origin}/request/track/${sourceRequest.publicToken}`
      : sourceRequest?.publicToken
        ? `/request/track/${sourceRequest.publicToken}`
        : "";

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{activeInvoiceId ? "Edit Invoice" : "Create Invoice"}</h1>
          <p className="text-sm text-muted-foreground">Build invoice sections and download a PDF when ready.</p>
        </div>
        <div className="flex gap-2">
          {linkedEvents.length === 1 ? (
            <Button type="button" variant="outline" asChild>
              <Link href={`/dashboard/events/${linkedEvents[0]._id}`}>Open Linked Event</Link>
            </Button>
          ) : linkedEvents.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  Linked Events ({linkedEvents.length})
                  <CaretDownIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {linkedEvents.map((event) => (
                  <DropdownMenuItem key={event._id} asChild>
                    <Link href={`/dashboard/events/${event._id}`} className="flex flex-col items-start gap-0.5">
                      <span className="font-medium">{event.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTimeRange(event.startAt, event.endAt)}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {activeInvoiceId ? (
            <InvoicePdfDownloadButton
              invoiceId={activeInvoiceId}
              invoiceNumber={invoiceData?.invoice?.invoiceNumber}
              variant="outline"
            />
          ) : null}
          {activeInvoiceId ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void duplicateInvoice({ id: activeInvoiceId }).then((result) => {
                  router.push(`/dashboard/financial-hub/invoices/${result.id}`);
                })
              }
            >
              Duplicate
            </Button>
          ) : null}
          {activeInvoiceId && isAdmin ? (
            <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete quote
            </Button>
          ) : null}
        </div>
      </div>

      {sourceRequest ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Booking request {sourceRequest.requestNumber}</CardTitle>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={`/dashboard/events/requests/${sourceRequest._id}`}>Open request</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <p>
              <span className="font-medium">Contact:</span> {sourceRequest.firstName} {sourceRequest.lastName} ·{" "}
              {sourceRequest.email} · {sourceRequest.phone}
            </p>
            <p>
              <span className="font-medium">Sponsor:</span> {sourceRequest.sponsorType}
              {sourceRequest.organization ? ` · ${sourceRequest.organization}` : ""}
            </p>
            <p>
              <span className="font-medium">Event:</span>{" "}
              {sourceRequest.eventName ? (
                <>
                  {sourceRequest.eventName} · {sourceRequest.eventCategory}
                </>
              ) : (
                sourceRequest.eventCategory
              )}{" "}
              · {sourceRequest.eventDateText}
            </p>
            <p>
              <span className="font-medium">Times:</span>{" "}
              {sourceRequest.eventScheduleText ? (
                <span className="whitespace-pre-wrap">{sourceRequest.eventScheduleText}</span>
              ) : (
                <>
                  {sourceRequest.eventStartTimeText} – {sourceRequest.eventEndTimeText}
                </>
              )}
            </p>
            <p>
              <span className="font-medium">Setup:</span> {sourceRequest.earliestSetupText}
              {sourceRequest.flexibleSetupTime ? " (flexible)" : ""}
            </p>
            <p>
              <span className="font-medium">Venue:</span> {sourceRequest.venueName ?? "—"}
              {sourceRequest.venueAddress ? ` · ${sourceRequest.venueAddress}` : ""}
            </p>
            <p>
              <span className="font-medium">Services:</span>{" "}
              {[sourceRequest.crewOrRental, ...sourceRequest.servicesNeeded].filter(Boolean).join(", ")}
            </p>
            <p>
              <span className="font-medium">Turnout:</span> {sourceRequest.expectedTurnout}
              {sourceRequest.productionTier ? ` · ${sourceRequest.productionTier}` : ""}
            </p>
            {sourceRequest.eventDescription ? (
              <p className="md:col-span-2 whitespace-pre-wrap">
                <span className="font-medium">Description:</span> {sourceRequest.eventDescription}
              </p>
            ) : null}
            {sourceRequest.existingEquipment ? (
              <p className="md:col-span-2 whitespace-pre-wrap">
                <span className="font-medium">Existing equipment:</span> {sourceRequest.existingEquipment}
              </p>
            ) : null}
            {sourceRequest.lightingPreference ? (
              <p>
                <span className="font-medium">Lighting:</span> {sourceRequest.lightingPreference}
              </p>
            ) : null}
            {sourceRequest.additionalNotes ? (
              <p className="md:col-span-2 whitespace-pre-wrap">
                <span className="font-medium">Client notes:</span> {sourceRequest.additionalNotes}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {saveMessage ? <p className="text-sm text-primary">{saveMessage}</p> : null}
      {saveWarning ? <p className="text-sm text-amber-600">{saveWarning}</p> : null}

      {invoiceData?.invoice?.clientApprovalStatus === "approved" && isDraftDirty ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This quote is approved. Saving changes may require client re-approval.
        </div>
      ) : null}

      {seriesOccurrenceStale ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Billable occurrence count changed (
          {invoiceData?.invoice?.billableOccurrenceCountAtSave} → {billableOccurrenceCount}). Recalculate
          equipment totals to refresh billed amounts.
          {activeInvoiceId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={() =>
                void recalculateSeriesEquipmentLines({ id: activeInvoiceId }).then(() =>
                  setSaveMessage("Recalculated billed equipment totals."),
                )
              }
            >
              Recalculate now
            </Button>
          ) : null}
        </div>
      ) : null}

      {isDraftDirty && divisionWarnings.length ? (
        <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {divisionWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4">
          <nav className="sticky top-4 z-10 flex flex-wrap gap-2 rounded-md border bg-background/95 p-2 text-sm shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
            {[
              { id: "section-equipment-packages", label: "Packages" },
              { id: "section-equipment-types", label: "Types" },
              { id: "section-external-rentals", label: "External" },
              { id: "section-artists", label: "Artists" },
              { id: "section-crew", label: "Crew" },
              { id: "section-fees", label: "Fees" },
            ].map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-md px-2 py-1 hover:bg-background"
              >
                {section.label}
              </a>
            ))}
          </nav>

          <div id="section-equipment-packages">
          <SectionEquipmentPackages
            rows={equipmentPackages}
            setRows={setEquipmentPackages}
            billableOccurrenceCount={billableOccurrenceCount}
            packageById={packageById}
            equipmentPricingMode={equipmentPricingMode}
            defaultBasis={defaultEquipmentBasis}
          />
          </div>
          <div id="section-equipment-types">
          <SectionEquipmentTypes
            rows={equipmentTypes}
            setRows={setEquipmentTypes}
            billableOccurrenceCount={billableOccurrenceCount}
            typeById={typeById}
            equipmentPricingMode={equipmentPricingMode}
            defaultBasis={defaultEquipmentBasis}
          />
          </div>
          <div id="section-external-rentals">
          <SectionExternalRentals rows={externalRentals} setRows={setExternalRentals} />
          </div>
          <div id="section-artists">
          <SectionArtists rows={artists} setRows={setArtists} />
          </div>
          <div id="section-crew">
          {linkedSeries ? (
            seriesCostData === undefined ? (
              <Card>
                <CardHeader>
                  <CardTitle>Crew Schedule</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Loading series crew template...
                </CardContent>
              </Card>
            ) : seriesCostData?.series ? (
            <>
              <EventSeriesShiftEditor
                seriesId={linkedSeries.seriesId}
                anchorStartAt={seriesCostData.series.anchorStartAt}
                anchorEndAt={seriesCostData.series.anchorEndAt}
                eventType={seriesCostData.series.eventType}
                rentalFulfillmentMode={seriesCostData.series.rentalFulfillmentMode}
                blockTemplates={seriesCostData.series.blockTemplates}
                shiftTemplates={seriesCostData.series.shiftTemplates}
                occurrences={seriesCostData.occurrences}
                billableOccurrenceCount={billableOccurrenceCount}
                title="Crew Schedule"
                description={`Define crew shift templates for the series. Invoice crew hours bill as template duration × ${billableOccurrenceCount} billable occurrence${billableOccurrenceCount === 1 ? "" : "s"}. Saving applies empty shifts to each selected occurrence.`}
                onMessage={setSaveMessage}
                onShiftDraftsChange={handleSeriesShiftDraftsChange}
              />
              <SectionAdditionalCrewHours
                rows={crewRows.filter((row) => row.source === "manual")}
                setRows={setManualCrewRows}
                rateMode={crewRateMode}
              />
            </>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Crew Schedule</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Linked series not found.
                </CardContent>
              </Card>
            )
          ) : linkedEvent ? (
            <>
              <InvoiceLinkedEventCrewSection
                eventId={linkedEvent._id}
                defaultCrewHourlyRateUsd={defaultCrewHourlyRateUsd}
                onEventCrewRowsChange={handleEventCrewRowsChange}
                onMessage={setSaveMessage}
              />
              <SectionAdditionalCrewHours
                rows={crewRows.filter((row) => row.source === "manual")}
                setRows={setManualCrewRows}
                rateMode={crewRateMode}
              />
            </>
          ) : (
            <SectionCrew rows={crewRows} setRows={setCrewRows} rateMode={crewRateMode} />
          )}
          </div>
          <div
            id="section-fees"
            onFocusCapture={() => setFeesCatalogEnabled(true)}
            onMouseEnter={() => setFeesCatalogEnabled(true)}
          >
          <SectionFees rows={fees} setRows={setFees} options={feeDefinitions ?? []} />
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">General</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="space-y-2">
                <Label>Issue date</Label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Manager</Label>
                <SearchableSelect
                  value={managerUserId}
                  onChange={onManagerChange}
                  options={managerOptions}
                  placeholder="Search managers..."
                  emptyLabel="Select manager"
                />
              </div>
              <div className="space-y-2">
                <Label>Equipment pricing</Label>
                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={equipmentPricingMode} onChange={(e) => setEquipmentPricingMode(e.target.value as "subsidized" | "nonSubsidized")}>
                  {EQUIPMENT_PRICING_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Crew rate mode</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={crewRateMode}
                  onChange={(e) => setCrewRateMode(e.target.value as "normal" | "lead" | "custom")}
                >
                  <option value="normal">Normal</option>
                  <option value="lead">Lead</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Client</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="space-y-2">
                <Label>Host</Label>
                <SearchableSelect
                  value={groupId}
                  onChange={onGroupChange}
                  options={groupOptions}
                  placeholder="Search hosts..."
                  emptyLabel="Select host"
                  onCreate={openCreateGroup}
                  createLabel="New Host"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact</Label>
                <SearchableSelect
                  value={contactId}
                  onChange={onContactChange}
                  options={contactOptions}
                  placeholder={groupId ? "Search contacts..." : "Select host first"}
                  emptyLabel={groupId ? "Select contact" : "Select host first"}
                  onCreate={openCreateContact}
                  createLabel="New Client"
                />
              </div>
              <Input placeholder="Email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              <Input placeholder="Phone" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              <Input placeholder="Address line 1" value={clientAddressLine1} onChange={(e) => setClientAddressLine1(e.target.value)} />
              <Input placeholder="City" value={clientCity} onChange={(e) => setClientCity(e.target.value)} />
              <Input placeholder="State" value={clientState} onChange={(e) => setClientState(e.target.value)} />
              <Input placeholder="Postal code" value={clientPostalCode} onChange={(e) => setClientPostalCode(e.target.value)} />
            </CardContent>
          </Card>

          {linkedSeries ? (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Linked series</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium">{linkedSeries.title}</p>
                <p className="text-muted-foreground">
                  {linkedSeries.activeOccurrenceCount} billable occurrence
                  {linkedSeries.activeOccurrenceCount === 1 ? "" : "s"}
                </p>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/events/series/${linkedSeries.seriesId}`}>Open series</Link>
                </Button>
                {activeInvoiceId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      void recalculateSeriesEquipmentLines({ id: activeInvoiceId }).then(() =>
                        setSaveMessage("Recalculated billed equipment totals."),
                      )
                    }
                  >
                    Recalculate equipment totals
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isDraftDirty ? "Draft total" : "Total"}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>Equipment: {formatUsd(draftTotals.equipmentSubtotalUsd)}</p>
              <p>External: {formatUsd(draftTotals.externalRentalsSubtotalUsd)}</p>
              <p>Artists: {formatUsd(draftTotals.artistsSubtotalUsd)}</p>
              <p>Crew: {formatUsd(draftTotals.crewSubtotalUsd)}</p>
              <p>Fees: {formatUsd(draftTotals.feesSubtotalUsd)}</p>
              <p>Subtotal: {formatUsd(draftTotals.subtotalUsd)}</p>
              <p>Discount: -{formatUsd(draftTotals.discountAmountUsd)}</p>
              <p className="border-t pt-2 font-semibold">{formatUsd(draftTotals.totalUsd)}</p>
              {pricingUnsaved && isDraftDirty ? (
                <p className="text-xs text-amber-700">Pricing differs from last saved total.</p>
              ) : null}
              {(draftTotals.discountAmountUsd > draftTotals.equipmentSubtotalUsd ||
                invoiceData?.invoice?.discountWarning) ? (
                <p className="text-xs text-amber-700">
                  {invoiceData?.invoice?.discountWarning ?? "Discount exceeds equipment rental subtotal."}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Discount & Notes</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="space-y-2">
                <Label>Discount type</Label>
                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={discountType} onChange={(e) => setDiscountType(e.target.value as "amount" | "percent")}>
                  <option value="amount">Amount</option>
                  <option value="percent">Percent</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Discount value</Label>
                <Input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {linkedSeries && seriesCostData?.costSummary ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Series margin (projected)</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>
                  Billed: <span className="font-medium">{formatUsd(draftTotals.totalUsd)}</span>
                </p>
                <p>
                  Series cost:{" "}
                  <span className="font-medium">
                    {formatUsd(seriesCostData.costSummary.projectedGrandTotalUsd)}
                  </span>
                </p>
                <p
                  className={
                    draftTotals.totalUsd - seriesCostData.costSummary.projectedGrandTotalUsd >= 0
                      ? "font-medium text-emerald-700"
                      : "font-medium text-rose-700"
                  }
                >
                  Margin:{" "}
                  {formatUsd(draftTotals.totalUsd - seriesCostData.costSummary.projectedGrandTotalUsd)}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card
            onFocusCapture={() => setTermsCatalogEnabled(true)}
            onMouseEnter={() => setTermsCatalogEnabled(true)}
          >
            <CardHeader className="pb-2"><CardTitle className="text-base">Terms</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                {(termsDefinitions ?? []).map((row) => {
                  const checked = termsIds.includes(row._id);
                  return (
                    <label key={row._id} className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() => {
                          setTermsIds((current) =>
                            checked ? current.filter((id) => id !== row._id) : [...current, row._id],
                          );
                        }}
                      />
                      <span>
                        {row.label} ({row.version})
                      </span>
                    </label>
                  );
                })}
              </div>
              <textarea
                className="min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Additional terms"
                value={additionalTermsMarkdown}
                onChange={(e) => setAdditionalTermsMarkdown(e.target.value)}
              />
            </CardContent>
          </Card>

          {isRequestLinkedQuote ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Request portal</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Input readOnly value={requestPortalUrl || "Save to load portal link."} />
                {requestPortalReady ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void withdrawFromRequestPortal()}>
                    Withdraw
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={() => void markReadyOnRequestPortal()}>
                    Ready for review
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Quote approval</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Input
                  readOnly
                  value={
                    approvalToken && origin
                      ? `${origin}/event/${approvalToken}`
                      : "Save draft to generate link."
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={!approvalToken} onClick={() => {
                    if (!approvalToken || !origin) return;
                    void navigator.clipboard.writeText(`${origin}/event/${approvalToken}`);
                  }}>
                    Copy link
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={!activeInvoiceId} onClick={() => void regenerateToken()}>
                    Regenerate
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeInvoiceId && (pdfExports?.length ?? 0) > 0 ? (
            <Collapsible defaultOpen={false}>
              <Card>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-6 py-4 text-left"
                  >
                    <span className="text-base font-semibold">
                      PDF exports ({pdfExports?.length ?? 0})
                    </span>
                    <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
                    {(pdfExports ?? []).slice(0, 5).map((row) => (
                      <p key={row._id}>
                        {row.fileName} · {formatDateTime(row.createdAt)}
                        {row.generatedByName ? ` · ${row.generatedByName}` : ""}
                      </p>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ) : null}
        </aside>
      </div>

      {activeInvoiceId && invoiceData?.invoice ? (
        <InvoiceQuoteApprovalDetails
          key={[
            invoiceData.invoice.clientIsPaymentSubmitter,
            invoiceData.invoice.paymentSubmitterEmail,
            invoiceData.invoice.paymentSubmitterName,
            invoiceData.invoice.payingPartyNotifiedAt,
            invoiceData.invoice.clientApprovalStatus,
            invoiceData.invoice.clientApprovalSignedName,
          ].join(":")}
          invoiceId={activeInvoiceId}
          invoice={invoiceData.invoice}
        />
      ) : null}

      {activeInvoiceId &&
      invoiceData?.invoice &&
      (invoiceData.invoice.clientApprovalStatus ?? "pending") === "approved" ? (
        <InvoicePaymentStatusSection invoiceId={activeInvoiceId} />
      ) : null}

      {groupModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-md">
            <CardHeader><CardTitle>New Host</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={newGroupType}
                  onChange={(e) => setNewGroupType(e.target.value as "vso" | "house" | "department" | "individual")}
                >
                  <option value="vso">VSO</option>
                  <option value="house">House</option>
                  <option value="department">Department</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Equipment pricing</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={newGroupEquipmentPricingMode}
                  onChange={(e) =>
                    setNewGroupEquipmentPricingMode(e.target.value as EquipmentPricingMode)
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
                <Button type="button" onClick={() => void submitCreateGroup()}>Create Host</Button>
                <Button type="button" variant="outline" onClick={() => setGroupModalOpen(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {contactModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-md">
            <CardHeader><CardTitle>New Client</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Linked to host: <span className="font-medium">{selectedGroup?.name || "Selected host"}</span>
              </p>
              <div className="space-y-2">
                <Label>First name</Label>
                <Input value={newContactFirstName} onChange={(e) => setNewContactFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Last name</Label>
                <Input value={newContactLastName} onChange={(e) => setNewContactLastName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void submitCreateContact()}>Create Client</Button>
                <Button type="button" variant="outline" onClick={() => setContactModalOpen(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <AdminCascadeDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        entityName="quote"
        preview={deletePreview ?? null}
        onConfirm={async (cascade) => {
          const id = activeInvoiceId ?? invoiceId;
          if (!id) return;
          await deleteInvoiceAdmin({ id, cascade });
          router.push("/dashboard/financial-hub/invoices");
        }}
      />

      <FormSaveBar
        tier="C"
        saveStatus={autoSaveState}
        saveError={autoSaveError}
        isDirty={isDraftDirty}
        isSubmitting={saving || autoSaveState === "saving"}
        saveLabel="Save"
        onSave={() => void persistDraft()}
        onRetry={() => void persistDraft()}
        summary={
          <div>
            <p className="text-xs text-muted-foreground">{isDraftDirty ? "Draft total" : "Total"}</p>
            <p className="font-semibold tabular-nums">{formatUsd(draftTotals.totalUsd)}</p>
          </div>
        }
      />
    </div>
  );
}

function SectionEquipmentPackages({
  rows,
  setRows,
  billableOccurrenceCount,
  packageById,
  equipmentPricingMode,
  defaultBasis = "total",
}: {
  rows: EquipmentRow[];
  setRows: Dispatch<SetStateAction<EquipmentRow[]>>;
  billableOccurrenceCount: number;
  packageById: Map<
    string,
    {
      _id: string;
      name?: string;
      subsidizedPackagePriceUsd?: number;
      nonSubsidizedPackagePriceUsd?: number;
      packagePriceCents: number;
      items?: Array<{ quantity: number; type?: { name?: string; model?: string } | null }>;
    }
  >;
  equipmentPricingMode: "subsidized" | "nonSubsidized";
  defaultBasis?: EquipmentRow["basis"];
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Equipment — Packages</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, idx) => {
          const pkg = packageById.get(row.refId);
          const rate =
            equipmentPricingMode === "subsidized"
              ? (pkg?.subsidizedPackagePriceUsd ??
                pkg?.nonSubsidizedPackagePriceUsd ??
                (pkg?.packagePriceCents ?? 0) / 100)
              : (pkg?.nonSubsidizedPackagePriceUsd ?? (pkg?.packagePriceCents ?? 0) / 100);
          const qty = Number(row.quantity || "0");
          const basis = row.basis ?? "total";
          const billedQty =
            basis === "per_occurrence" && billableOccurrenceCount > 0
              ? qty * billableOccurrenceCount
              : qty;
          const lineTotal = billedQty * rate;
          return (
            <div key={`pkg-${idx}`} className="space-y-1">
            <div className="grid gap-2 md:grid-cols-[1fr_120px_120px_100px_auto]">
              <InventoryPackageSearchSelect
                value={row.refId}
                onChange={(v) =>
                  setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, refId: v } : r)))
                }
              />
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={basis}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, basis: e.target.value as "total" | "per_occurrence" } : r,
                    ),
                  )
                }
              >
                <option value="total">Total qty</option>
                <option value="per_occurrence">Per occurrence</option>
              </select>
              <Input value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
              <p className="self-center text-xs text-muted-foreground tabular-nums">
                {formatUsd(lineTotal)}
                {basis === "per_occurrence" && billableOccurrenceCount > 0
                  ? ` (${qty}×${billableOccurrenceCount})`
                  : basis === "total" && billableOccurrenceCount > 1
                    ? ` (~${Math.floor(qty / billableOccurrenceCount)}/show)`
                    : ""}
              </p>
              <Button type="button" variant="outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
            </div>
            {pkg?.items?.length ? (
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Package contents ({pkg.items.length})
                    <CaretDownIcon className="size-3" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="pt-1 text-xs text-muted-foreground">
                    {pkg.items
                      .map((item) =>
                        `${item.quantity}× ${item.type?.name ?? "item"}${item.type?.model ? ` · ${item.type.model}` : ""}`,
                      )
                      .join(", ")}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            </div>
          );
        })}
        <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, { refId: "", quantity: "1", basis: defaultBasis }])}>Add package</Button>
      </CardContent>
    </Card>
  );
}

function SectionEquipmentTypes({
  rows,
  setRows,
  billableOccurrenceCount,
  typeById,
  equipmentPricingMode,
  defaultBasis = "total",
}: {
  rows: EquipmentRow[];
  setRows: Dispatch<SetStateAction<EquipmentRow[]>>;
  billableOccurrenceCount: number;
  typeById: Map<
    string,
    {
      _id: string;
      subsidizedRentalPriceUsd?: number;
      nonSubsidizedRentalPriceUsd?: number;
      rentalPriceUsd?: number;
    }
  >;
  equipmentPricingMode: "subsidized" | "nonSubsidized";
  defaultBasis?: EquipmentRow["basis"];
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Equipment — Individual Asset Types</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, idx) => {
          const type = typeById.get(row.refId);
          const rate =
            equipmentPricingMode === "subsidized"
              ? (type?.subsidizedRentalPriceUsd ??
                type?.nonSubsidizedRentalPriceUsd ??
                type?.rentalPriceUsd ??
                0)
              : (type?.nonSubsidizedRentalPriceUsd ?? type?.rentalPriceUsd ?? 0);
          const qty = Number(row.quantity || "0");
          const basis = row.basis ?? "total";
          const billedQty =
            basis === "per_occurrence" && billableOccurrenceCount > 0
              ? qty * billableOccurrenceCount
              : qty;
          const lineTotal = billedQty * rate;
          return (
            <div key={`type-${idx}`} className="grid gap-2 md:grid-cols-[1fr_120px_120px_100px_auto]">
              <InventoryTypeSearchSelect
                value={row.refId}
                onChange={(v) =>
                  setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, refId: v } : r)))
                }
              />
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={basis}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, basis: e.target.value as "total" | "per_occurrence" } : r,
                    ),
                  )
                }
              >
                <option value="total">Total qty</option>
                <option value="per_occurrence">Per occurrence</option>
              </select>
              <Input value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
              <p className="self-center text-xs text-muted-foreground tabular-nums">
                {formatUsd(lineTotal)}
                {basis === "per_occurrence" && billableOccurrenceCount > 0
                  ? ` (${qty}×${billableOccurrenceCount})`
                  : basis === "total" && billableOccurrenceCount > 1
                    ? ` (~${Math.floor(qty / billableOccurrenceCount)}/show)`
                    : ""}
              </p>
              <Button type="button" variant="outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
            </div>
          );
        })}
        <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, { refId: "", quantity: "1", basis: defaultBasis }])}>Add type</Button>
      </CardContent>
    </Card>
  );
}

function SectionExternalRentals({
  rows,
  setRows,
}: {
  rows: ExternalRentalRow[];
  setRows: Dispatch<SetStateAction<ExternalRentalRow[]>>;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>External Rentals</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, idx) => (
          <div key={`ext-${idx}`} className="grid gap-2 md:grid-cols-5">
            <Input placeholder="Provider" value={row.provider} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, provider: e.target.value } : r)))} />
            <Input placeholder="Line item" value={row.label} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)))} />
            <Input placeholder="Qty" value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
            <Input placeholder="Rate" value={row.rateUsd} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, rateUsd: e.target.value } : r)))} />
            <Button type="button" variant="outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, { provider: "", label: "", quantity: "1", rateUsd: "0" }])}>Add external rental</Button>
      </CardContent>
    </Card>
  );
}

function SectionArtists({
  rows,
  setRows,
}: {
  rows: ArtistRow[];
  setRows: Dispatch<SetStateAction<ArtistRow[]>>;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Artists (placeholder)</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, idx) => (
          <div key={`artist-${idx}`} className="grid gap-2 md:grid-cols-4">
            <Input placeholder="Artist / role" value={row.label} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)))} />
            <Input placeholder="Qty" value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
            <Input placeholder="Rate" value={row.rateUsd} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, rateUsd: e.target.value } : r)))} />
            <Button type="button" variant="outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, { label: "", quantity: "1", rateUsd: "0" }])}>Add artist row</Button>
      </CardContent>
    </Card>
  );
}

function SectionCrew({
  rows,
  setRows,
  rateMode,
}: {
  rows: CrewRow[];
  setRows: Dispatch<SetStateAction<CrewRow[]>>;
  rateMode: "normal" | "lead" | "custom";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Crew (
          {rateMode === "custom" ? "Custom rate per row" : rateMode === "lead" ? "Lead rate from settings" : "Normal rate from settings"}
          )
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Link an event to this invoice to edit crew schedule blocks and slots inline.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, idx) => (
          <div key={`crew-${idx}`} className={`grid gap-2 ${rateMode === "custom" ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
            <Input placeholder="Crew role" value={row.label} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)))} />
            <Input placeholder="Qty/hours" value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
            {rateMode === "custom" ? (
              <Input
                placeholder="Rate (USD)"
                value={row.rateUsd ?? "0"}
                onChange={(e) =>
                  setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, rateUsd: e.target.value } : r)))
                }
              />
            ) : null}
            <Button type="button" variant="outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { label: "", quantity: "1", rateUsd: rateMode === "custom" ? "0" : undefined },
            ])
          }
        >
          Add crew row
        </Button>
      </CardContent>
    </Card>
  );
}

function SectionAdditionalCrewHours({
  rows,
  setRows,
  rateMode,
}: {
  rows: CrewRow[];
  setRows: Dispatch<SetStateAction<CrewRow[]>>;
  rateMode: "normal" | "lead" | "custom";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Additional billable hours</CardTitle>
        <p className="text-sm text-muted-foreground">
          Add extra crew hours on top of the linked event schedule. Open event slots use the invoice default crew rate.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, idx) => (
          <div key={`crew-manual-${idx}`} className={`grid gap-2 ${rateMode === "custom" ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
            <Input placeholder="Description" value={row.label} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)))} />
            <Input placeholder="Hours" value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
            {rateMode === "custom" ? (
              <Input
                placeholder="Rate (USD)"
                value={row.rateUsd ?? "0"}
                onChange={(e) =>
                  setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, rateUsd: e.target.value } : r)))
                }
              />
            ) : null}
            <Button type="button" variant="outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { label: "", quantity: "1", rateUsd: rateMode === "custom" ? "0" : undefined, source: "manual" },
            ])
          }
        >
          Add additional hours
        </Button>
      </CardContent>
    </Card>
  );
}

function SectionFees({
  rows,
  setRows,
  options,
}: {
  rows: FeeRow[];
  setRows: Dispatch<SetStateAction<FeeRow[]>>;
  options: Array<{ _id: string; label: string; defaultAmountUsd?: number }>;
}) {
  const selectOptions = options.map((o) => ({ value: o._id, label: o.label }));
  return (
    <Card>
      <CardHeader><CardTitle>Fees</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, idx) => (
          <div key={`fee-${idx}`} className="grid gap-2 md:grid-cols-5">
            <SearchableSelect
              value={row.feeDefinitionId}
              onChange={(value) => {
                const selected = options.find((f) => f._id === value);
                setRows((prev) =>
                  prev.map((r, i) =>
                    i === idx
                      ? {
                          ...r,
                          feeDefinitionId: value,
                          label: selected?.label ?? r.label,
                          rateUsd: (selected?.defaultAmountUsd ?? Number(r.rateUsd || "0")).toString(),
                        }
                      : r,
                  ),
                );
              }}
              options={selectOptions}
              placeholder="Search fee definition..."
              emptyLabel="Select fee"
            />
            <Input placeholder="Label" value={row.label} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)))} />
            <Input placeholder="Qty" value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
            <Input placeholder="Rate" value={row.rateUsd} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, rateUsd: e.target.value } : r)))} />
            <Button type="button" variant="outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, { feeDefinitionId: "", label: "", quantity: "1", rateUsd: "0" }])}>Add fee</Button>
      </CardContent>
    </Card>
  );
}
