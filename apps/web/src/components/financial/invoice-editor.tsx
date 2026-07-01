"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { AdminCascadeDeleteDialog } from "@/components/admin/admin-cascade-delete-dialog";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  mergeEventCrewWithManualRows,
  type InvoiceCrewRow,
} from "@/lib/invoice-crew-from-event";
import { CaretDownIcon } from "@phosphor-icons/react";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { FormSaveBar } from "@/components/forms";

type EquipmentRow = { refId: string; quantity: string };
type ExternalRentalRow = { provider: string; label: string; quantity: string; rateUsd: string };
type ArtistRow = { label: string; quantity: string; rateUsd: string };
type CrewRow = InvoiceCrewRow;
type FeeRow = { feeDefinitionId: string; label: string; quantity: string; rateUsd: string };

import {
  INVOICE_GROUP_TYPE_LABELS,
  EQUIPMENT_PRICING_MODE_LABELS,
  EQUIPMENT_PRICING_MODE_OPTIONS,
  type EquipmentPricingMode,
} from "@/lib/invoice-group-labels";
import { formatContactFullName, splitContactName } from "@/lib/contact-name";

export function InvoiceEditor({
  invoiceId,
  initialIssueDate,
}: {
  invoiceId?: Id<"invoices">;
  initialIssueDate?: string;
}) {
  const router = useRouter();
  const viewer = useQuery(api.users.getViewer, {});
  const [groupId, setGroupId] = useState("");
  const [contactId, setContactId] = useState("");
  const session = authClient.useSession();
  const managerList = useQuery(api.invoices.listManagers, {});
  const groups = useQuery(api.invoiceGroups.list, { activeOnly: true });
  const feeDefinitions = useQuery(api.invoiceFeeDefinitions.list, { activeOnly: true });
  const termsDefinitions = useQuery(api.invoiceTerms.list, { activeOnly: true });
  const settings = useQuery(api.invoiceSettings.get, {});
  const packages = useQuery(api.inventoryPackages.list, {});
  const types = useQuery(api.inventoryTypes.list, {});
  const invoiceData = useQuery(api.invoices.get, invoiceId ? { id: invoiceId } : "skip");
  const contacts = useQuery(api.invoiceContacts.list, {
    activeOnly: true,
    ...(groupId ? { groupId: groupId as Id<"invoiceGroups"> } : {}),
  });

  const createDraft = useMutation(api.invoices.createDraft);
  const updateDraft = useMutation(api.invoices.updateDraft);
  const markReadyForClientReview = useMutation(api.invoices.markReadyForClientReview);
  const withdrawFromClientReview = useMutation(api.invoices.withdrawFromClientReview);
  const regeneratePublicApprovalToken = useMutation(api.invoices.regeneratePublicApprovalToken);
  const resetApprovalToPending = useMutation(api.invoices.resetApprovalToPending);
  const createTermsDefinition = useMutation(api.invoiceTerms.create);
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
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<Id<"invoices"> | undefined>(invoiceId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const linkedEvent = useQuery(
    api.events.getByInvoiceId,
    activeInvoiceId ? { invoiceId: activeInvoiceId } : "skip",
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
  const [newTermsLabel, setNewTermsLabel] = useState("");
  const [newTermsVersion, setNewTermsVersion] = useState("v1");
  const [newTermsMarkdown, setNewTermsMarkdown] = useState("");
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

  const lastSavedSignatureRef = useRef("");
  const saveRequestIdRef = useRef(0);
  const hasHydratedFromServerRef = useRef(false);
  const crewBootstrappedRef = useRef(false);
  const savedCrewSnapshotRef = useRef<CrewRow[]>([]);
  const [invoiceFieldsHydrated, setInvoiceFieldsHydrated] = useState(false);
  const reapprovalDecisionRef = useRef<null | boolean>(null);

  const managerOptions = useMemo(
    () =>
      (managerList ?? []).map((entry) => ({
        value: entry.id,
        label: entry.email ? `${entry.name} (${entry.email})` : entry.name,
      })),
    [managerList],
  );

  const packageOptions = useMemo(
    () => (packages ?? []).map((p) => ({ value: p._id, label: p.name })),
    [packages],
  );
  const typeOptions = useMemo(
    () => (types ?? []).map((t) => ({ value: t._id, label: `${t.name} · ${t.model}` })),
    [types],
  );
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
  const selectedContact = useMemo(
    () => (contacts ?? []).find((contact) => contact._id === contactId),
    [contacts, contactId],
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
    savedCrewSnapshotRef.current = [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInvoiceFieldsHydrated(false);
  }, [invoiceId]);

  useEffect(() => {
    if (!invoiceData || !invoiceId) return;
    if (invoiceData.invoice._id !== invoiceId) return;
    if (hasHydratedFromServerRef.current) return;

    const { invoice, lineItems } = invoiceData;
    hasHydratedFromServerRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        .map((row) => ({ refId: row.packageId ?? "", quantity: row.quantity.toString() })) || [{ refId: "", quantity: "1" }],
    );
    setEquipmentTypes(
      lineItems
        .filter((row) => row.section === "equipment_type")
        .map((row) => ({ refId: row.typeId ?? "", quantity: row.quantity.toString() })) || [{ refId: "", quantity: "1" }],
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
    lastSavedSignatureRef.current = JSON.stringify({
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate ?? "",
      managerUserId: invoice.managerUserId,
      managerName: invoice.managerName,
      managerEmail: invoice.managerEmail ?? "",
      groupId: invoice.groupId ?? "",
      contactId: invoice.contactId ?? "",
      clientGroupName: invoice.clientGroupName ?? "",
      clientGroupType: invoice.clientGroupType ?? "",
      clientContactName: invoice.clientContactName ?? "",
      clientEmail: invoice.clientEmail ?? "",
      clientPhone: invoice.clientPhone ?? "",
      clientAddressLine1: invoice.clientAddressLine1 ?? "",
      clientAddressLine2: invoice.clientAddressLine2 ?? "",
      clientCity: invoice.clientCity ?? "",
      clientState: invoice.clientState ?? "",
      clientPostalCode: invoice.clientPostalCode ?? "",
      equipmentPricingMode: invoice.equipmentPricingMode,
      crewRateMode: invoice.crewRateMode,
      discountType: invoice.discountType,
      discountValue: invoice.discountValue,
      notes: invoice.notes ?? "",
      termsIds:
        invoice.termsIds?.length
          ? invoice.termsIds
          : invoice.termsId
            ? [invoice.termsId]
            : [],
      additionalTermsMarkdown: invoice.additionalTermsMarkdown ?? "",
      lineItems: lineItems.map((row) => ({
        section: row.section,
        order: row.order,
        provider: row.provider ?? "",
        label: row.label,
        notes: row.notes ?? "",
        quantity: row.quantity,
        rateUsd: row.rateUsd,
        packageId: row.packageId ?? "",
        typeId: row.typeId ?? "",
        feeDefinitionId: row.feeDefinitionId ?? "",
      })),
    });
    reapprovalDecisionRef.current = null;
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
    if (activeInvoiceId && linkedEvent === undefined) return;

    crewBootstrappedRef.current = true;

    if (linkedEvent) {
      // Crew lines for linked events come from the event schedule editor, not saved invoice rows.
      return;
    }

    if (savedCrewSnapshotRef.current.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCrewRows(savedCrewSnapshotRef.current);
    }
  }, [invoiceId, invoiceFieldsHydrated, linkedEvent, activeInvoiceId]);

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
    }> = [];
    for (const row of equipmentPackages) {
      if (!row.refId || Number(row.quantity) <= 0) continue;
      const pkg = (packages ?? []).find((p) => p._id === row.refId);
      rows.push({
        section: "equipment_package",
        order: order++,
        label: pkg?.name ?? "Package",
        quantity: Number(row.quantity),
        rateUsd: 0,
        packageId: row.refId as Id<"inventoryPackages">,
      });
    }
    for (const row of equipmentTypes) {
      if (!row.refId || Number(row.quantity) <= 0) continue;
      const type = (types ?? []).find((t) => t._id === row.refId);
      rows.push({
        section: "equipment_type",
        order: order++,
        label: type ? `${type.name} · ${type.model}` : "Type",
        quantity: Number(row.quantity),
        rateUsd: 0,
        typeId: row.refId as Id<"inventoryTypes">,
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
      signature !== lastSavedSignatureRef.current;

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
      }
      lastSavedSignatureRef.current = signature;
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

  async function save() {
    await persistDraft();
  }

  async function regenerateToken() {
    if (!activeInvoiceId) return;
    if (!window.confirm("Regenerate the public quote token? Old links will stop working.")) return;
    const result = await regeneratePublicApprovalToken({ id: activeInvoiceId });
    setApprovalToken(result.token);
    setSaveMessage("Public quote link regenerated.");
  }

  async function resetQuoteToPending() {
    if (!activeInvoiceId) return;
    await resetApprovalToPending({ id: activeInvoiceId });
    setSaveMessage("Quote status reset to pending.");
  }

  async function createGlobalTerms() {
    if (!newTermsLabel.trim() || !newTermsMarkdown.trim()) {
      window.alert("Provide terms label and markdown.");
      return;
    }
    const createdId = await createTermsDefinition({
      label: newTermsLabel.trim(),
      version: newTermsVersion.trim() || "v1",
      markdown: newTermsMarkdown.trim(),
      active: true,
    });
    setTermsIds((current) => [...current, createdId]);
    setNewTermsLabel("");
    setNewTermsVersion("v1");
    setNewTermsMarkdown("");
    setSaveMessage("Global terms template created.");
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
    invoiceFieldsHydrated &&
    draftSignature !== "" &&
    draftSignature !== lastSavedSignatureRef.current;

  const linkedEvents = linkedEvent?.linkedEvents ?? [];
  const isRequestLinkedQuote = Boolean(invoiceData?.invoice?.sourceEventRequestId);
  const requestPortalReady = Boolean(invoiceData?.invoice?.clientReviewReadyAt);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const requestPortalUrl =
    sourceRequest?.publicToken && origin
      ? `${origin}/public/request/track/${sourceRequest.publicToken}`
      : sourceRequest?.publicToken
        ? `/public/request/track/${sourceRequest.publicToken}`
        : "";

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{activeInvoiceId ? "Edit Invoice" : "Create Invoice"}</h1>
          <p className="text-sm text-muted-foreground">Build invoice sections and export a print-ready PDF.</p>
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
                        {new Date(event.startAt).toLocaleString()} – {new Date(event.endAt).toLocaleString()}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {activeInvoiceId ? (
            <Button type="button" variant="outline" asChild>
              <Link href={`/dashboard/financial-hub/invoices/${activeInvoiceId}/print`}>Print / PDF</Link>
            </Button>
          ) : null}
          {activeInvoiceId && isAdmin ? (
            <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete quote
            </Button>
          ) : null}
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving..." : "Save Draft"}
          </Button>
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

      <Card>
        <CardHeader><CardTitle>General</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
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
            {selectedGroup ? (
              <p className="text-xs text-muted-foreground">
                Default from host:{" "}
                {EQUIPMENT_PRICING_MODE_LABELS[selectedGroup.equipmentPricingMode ?? "subsidized"]}. You can
                override per invoice.
              </p>
            ) : null}
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

      {isRequestLinkedQuote ? (
        <Card>
          <CardHeader>
            <CardTitle>Request portal review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This quote is linked to a booking request. Clients review and approve it on the request portal —
              no standalone approval link is generated.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                readOnly
                value={requestPortalUrl || "Save the quote once to load the request portal link."}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!requestPortalUrl}
                onClick={() => {
                  if (!requestPortalUrl) return;
                  void navigator.clipboard.writeText(requestPortalUrl);
                }}
              >
                Copy portal link
              </Button>
              {requestPortalReady ? (
                <Button type="button" variant="outline" onClick={() => void withdrawFromRequestPortal()}>
                  Withdraw from portal
                </Button>
              ) : (
                <Button type="button" onClick={() => void markReadyOnRequestPortal()}>
                  Ready for client review
                </Button>
              )}
            </div>
            {invoiceData?.invoice ? (
              <div className="text-sm text-muted-foreground">
                Portal status: {requestPortalReady ? "Visible to client" : "Not published yet"}
              </div>
            ) : null}
            {invoiceData?.invoice?.clientApprovalStatus === "changes_requested" ? (
              <Button type="button" variant="outline" onClick={() => void resetQuoteToPending()}>
                Reset to pending
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Client Quote Approval</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                readOnly
                value={
                  approvalToken && origin
                    ? `${origin}/public/quote/${approvalToken}`
                    : "Save draft once to generate the public quote link."
                }
              />
              <Button
                type="button"
                variant="outline"
                disabled={!approvalToken || !origin}
                onClick={() => {
                  if (!approvalToken || !origin) return;
                  void navigator.clipboard.writeText(`${origin}/public/quote/${approvalToken}`);
                }}
              >
                Copy Link
              </Button>
              <Button type="button" variant="outline" disabled={!activeInvoiceId} onClick={() => void regenerateToken()}>
                Regenerate Token
              </Button>
              {invoiceData?.invoice?.clientApprovalStatus === "changes_requested" ? (
                <Button type="button" variant="outline" onClick={() => void resetQuoteToPending()}>
                  Reset To Pending
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

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

      <Card>
        <CardHeader><CardTitle>Quote Terms & Conditions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Global terms templates</Label>
            <p className="text-xs text-muted-foreground">
              Select one or more templates. Leave all unchecked to use default terms from global settings.
            </p>
            <div className="space-y-2 rounded-md border p-3">
              {(termsDefinitions ?? []).length ? (
                (termsDefinitions ?? []).map((row) => {
                  const checked = termsIds.includes(row._id);
                  return (
                    <label key={row._id} className="flex cursor-pointer items-start gap-2 text-sm">
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
                })
              ) : (
                <p className="text-sm text-muted-foreground">No global terms templates yet.</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Additional terms (invoice-specific)</Label>
            <textarea
              className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={additionalTermsMarkdown}
              onChange={(e) => setAdditionalTermsMarkdown(e.target.value)}
            />
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Create global terms template</p>
            <div className="grid gap-2 md:grid-cols-2">
              <Input placeholder="Label" value={newTermsLabel} onChange={(e) => setNewTermsLabel(e.target.value)} />
              <Input placeholder="Version" value={newTermsVersion} onChange={(e) => setNewTermsVersion(e.target.value)} />
              <div className="md:col-span-2">
                <textarea
                  className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Global terms markdown"
                  value={newTermsMarkdown}
                  onChange={(e) => setNewTermsMarkdown(e.target.value)}
                />
              </div>
            </div>
            <Button type="button" variant="outline" className="mt-2" onClick={() => void createGlobalTerms()}>
              Add Global Terms
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Client</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
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
            {!groupId ? (
              <p className="text-xs text-muted-foreground">Clients are linked to a host. Select a host first.</p>
            ) : null}
          </div>
          {selectedGroup ? (
            <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{selectedGroup.name}</p>
              <p className="text-muted-foreground">
                {INVOICE_GROUP_TYPE_LABELS[selectedGroup.type] ?? selectedGroup.type}
                {" · "}
                {EQUIPMENT_PRICING_MODE_LABELS[selectedGroup.equipmentPricingMode ?? "subsidized"]}
              </p>
              {selectedContact ? (
                <p className="text-muted-foreground">
                  Contact: {formatContactFullName(selectedContact.firstName, selectedContact.lastName)}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Select a host to link this invoice.
            </div>
          )}
          <Input placeholder="Email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
          <Input placeholder="Phone" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
          <Input placeholder="Address line 1" value={clientAddressLine1} onChange={(e) => setClientAddressLine1(e.target.value)} />
          <Input placeholder="Address line 2" value={clientAddressLine2} onChange={(e) => setClientAddressLine2(e.target.value)} />
          <Input placeholder="City" value={clientCity} onChange={(e) => setClientCity(e.target.value)} />
          <Input placeholder="State" value={clientState} onChange={(e) => setClientState(e.target.value)} />
          <Input placeholder="Postal code" value={clientPostalCode} onChange={(e) => setClientPostalCode(e.target.value)} />
        </CardContent>
      </Card>

      <SectionEquipmentPackages rows={equipmentPackages} setRows={setEquipmentPackages} options={packageOptions} />
      <SectionEquipmentTypes rows={equipmentTypes} setRows={setEquipmentTypes} options={typeOptions} />
      <SectionExternalRentals rows={externalRentals} setRows={setExternalRentals} />
      <SectionArtists rows={artists} setRows={setArtists} />
      {linkedEvent ? (
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
      <SectionFees rows={fees} setRows={setFees} options={feeDefinitions ?? []} />

      <Card>
        <CardHeader><CardTitle>Discount & Notes</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
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
          <div className="space-y-2 md:col-span-3">
            <Label>Notes</Label>
            <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {invoiceData?.invoice ? (
        <Card>
          <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <p>Equipment: ${invoiceData.invoice.equipmentSubtotalUsd.toFixed(2)}</p>
            <p>External rentals: ${invoiceData.invoice.externalRentalsSubtotalUsd.toFixed(2)}</p>
            <p>Artists: ${invoiceData.invoice.artistsSubtotalUsd.toFixed(2)}</p>
            <p>Crew: ${invoiceData.invoice.crewSubtotalUsd.toFixed(2)}</p>
            <p>Fees: ${invoiceData.invoice.feesSubtotalUsd.toFixed(2)}</p>
            <p>Subtotal: ${invoiceData.invoice.subtotalUsd.toFixed(2)}</p>
            <p>Discount: -${invoiceData.invoice.discountAmountUsd.toFixed(2)}</p>
            <p className="font-semibold">Total: ${invoiceData.invoice.totalUsd.toFixed(2)}</p>
          </CardContent>
        </Card>
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
      />
    </div>
  );
}

function SectionEquipmentPackages({
  rows,
  setRows,
  options,
}: {
  rows: EquipmentRow[];
  setRows: Dispatch<SetStateAction<EquipmentRow[]>>;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Equipment — Packages</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, idx) => (
          <div key={`pkg-${idx}`} className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
            <SearchableSelect value={row.refId} onChange={(v) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, refId: v } : r)))} options={options} placeholder="Search packages..." emptyLabel="Select package" />
            <Input value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
            <Button type="button" variant="outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, { refId: "", quantity: "1" }])}>Add package</Button>
      </CardContent>
    </Card>
  );
}

function SectionEquipmentTypes({
  rows,
  setRows,
  options,
}: {
  rows: EquipmentRow[];
  setRows: Dispatch<SetStateAction<EquipmentRow[]>>;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Equipment — Individual Asset Types</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, idx) => (
          <div key={`type-${idx}`} className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
            <SearchableSelect value={row.refId} onChange={(v) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, refId: v } : r)))} options={options} placeholder="Search types..." emptyLabel="Select type" />
            <Input value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
            <Button type="button" variant="outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, { refId: "", quantity: "1" }])}>Add type</Button>
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
