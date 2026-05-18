"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type EquipmentRow = { refId: string; quantity: string };
type ExternalRentalRow = { provider: string; label: string; quantity: string; rateUsd: string };
type ArtistRow = { label: string; quantity: string; rateUsd: string };
type CrewRow = { label: string; quantity: string; rateUsd?: string };
type FeeRow = { feeDefinitionId: string; label: string; quantity: string; rateUsd: string };

const groupTypeLabels: Record<string, string> = {
  vso: "VSO",
  house: "House",
  department: "Department",
  individual: "Individual",
};

export function InvoiceEditor({
  invoiceId,
  initialIssueDate,
}: {
  invoiceId?: Id<"invoices">;
  initialIssueDate?: string;
}) {
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
  const finalizeInvoice = useMutation(api.invoices.finalize);
  const regeneratePublicApprovalToken = useMutation(api.invoices.regeneratePublicApprovalToken);
  const resetApprovalToPending = useMutation(api.invoices.resetApprovalToPending);
  const createTermsDefinition = useMutation(api.invoiceTerms.create);
  const createGroup = useMutation(api.invoiceGroups.create);
  const createContact = useMutation(api.invoiceContacts.create);

  const [issueDate, setIssueDate] = useState(initialIssueDate ?? "");
  const [dueDate, setDueDate] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [clientGroupName, setClientGroupName] = useState("");
  const [clientGroupType, setClientGroupType] = useState<"" | "vso" | "house" | "department" | "individual">("");
  const [clientContactName, setClientContactName] = useState("");
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
  const linkedEvent = useQuery(
    api.events.getByInvoiceId,
    activeInvoiceId ? { invoiceId: activeInvoiceId } : "skip",
  );
  const [approvalToken, setApprovalToken] = useState("");
  const [termsId, setTermsId] = useState("");
  const [additionalTermsMarkdown, setAdditionalTermsMarkdown] = useState("");
  const [newTermsLabel, setNewTermsLabel] = useState("");
  const [newTermsVersion, setNewTermsVersion] = useState("v1");
  const [newTermsMarkdown, setNewTermsMarkdown] = useState("");
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState<"vso" | "house" | "department" | "individual">("department");
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  const lastSavedSignatureRef = useRef("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRequestIdRef = useRef(0);
  const suppressAutoSaveOnceRef = useRef(false);
  const persistDraftRef = useRef<(mode: "manual" | "auto") => Promise<boolean>>(async () => false);
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
        label: `${g.name} (${groupTypeLabels[g.type] ?? g.type})`,
      })),
    [groups],
  );
  const contactOptions = useMemo(
    () =>
      (contacts ?? []).map((c) => ({
        value: c._id,
        label: c.email ? `${c.name} (${c.email})` : c.name,
      })),
    [contacts],
  );

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
    if (!invoiceData) return;
    const { invoice, lineItems } = invoiceData;
    suppressAutoSaveOnceRef.current = true;
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
    setClientGroupName(invoice.clientGroupName ?? "");
    setClientGroupType((invoice.clientGroupType as typeof clientGroupType) ?? "");
    setClientContactName(invoice.clientContactName ?? "");
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
    setTermsId(invoice.termsId ?? "");
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
    setCrewRows(
      lineItems
        .filter((row) => row.section === "crew")
        .map((row) => ({ label: row.label, quantity: row.quantity.toString(), rateUsd: row.rateUsd.toString() })),
    );
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
      termsId: invoice.termsId ?? "",
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
  }, [invoiceData]);

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
      setClientGroupName(selected.name);
      setClientGroupType(selected.type);
    }
  }

  function onContactChange(nextContactId: string) {
    setContactId(nextContactId);
    const selected = (contacts ?? []).find((c) => c._id === nextContactId);
    if (selected) {
      setClientContactName(selected.name);
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
      active: true,
    });
    setGroupModalOpen(false);
    onGroupChange(id);
    setNewGroupName("");
  }

  function openCreateContact(prefill: string) {
    if (!groupId) {
      window.alert("Select a group first so the client/contact can be linked.");
      return;
    }
    setNewContactName(prefill);
    setContactModalOpen(true);
  }

  async function submitCreateContact() {
    if (!groupId) {
      window.alert("Select a group first.");
      return;
    }
    if (!newContactName.trim()) return;
    const id = await createContact({
      groupId: groupId as Id<"invoiceGroups">,
      name: newContactName.trim(),
      email: newContactEmail.trim() || undefined,
      phone: newContactPhone.trim() || undefined,
      active: true,
    });
    setContactModalOpen(false);
    onContactChange(id);
    setNewContactName("");
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
    return {
      issueDate,
      dueDate: dueDate || undefined,
      managerUserId,
      managerName,
      managerEmail: managerEmail || undefined,
      groupId: groupId ? (groupId as Id<"invoiceGroups">) : undefined,
      contactId: contactId ? (contactId as Id<"invoiceContacts">) : undefined,
      clientGroupName: clientGroupName || undefined,
      clientGroupType: clientGroupType || undefined,
      clientContactName: clientContactName || undefined,
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
      termsId: termsId ? (termsId as Id<"invoiceTerms">) : undefined,
      additionalTermsMarkdown: additionalTermsMarkdown || undefined,
      lineItems,
    };
  }

  async function persistDraft(mode: "manual" | "auto") {
    const payload = buildPayload();
    if (!payload) {
      if (mode === "manual") window.alert("Select a manager and add at least one line item.");
      return false;
    }

    const signature = JSON.stringify(payload);
    if (mode === "auto" && signature === lastSavedSignatureRef.current) return true;
    const approvedQuoteEdited =
      invoiceData?.invoice?.clientApprovalStatus === "approved" &&
      signature !== lastSavedSignatureRef.current;

    if (approvedQuoteEdited && reapprovalDecisionRef.current === null) {
      if (mode === "auto") {
        // Avoid surprise popups during background save. Require an explicit save click.
        setAutoSaveState("idle");
        setAutoSaveError("Manual save required: decide whether client re-approval is needed.");
        return false;
      }
      reapprovalDecisionRef.current = window.confirm(
        "This quote was already approved and has changed. Require client approval again?",
      );
    }

    const requestId = ++saveRequestIdRef.current;
    if (mode === "manual") {
      setSaving(true);
      setSaveMessage(null);
    } else {
      setAutoSaveState("saving");
      setAutoSaveError(null);
    }
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
        if (mode === "manual") setSaveMessage("Invoice saved.");
        setAutoSaveState("saved");
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save invoice.";
      if (mode === "manual") window.alert(message);
      if (requestId === saveRequestIdRef.current) {
        setAutoSaveState("error");
        setAutoSaveError(message);
      }
      return false;
    } finally {
      if (mode === "manual") setSaving(false);
    }
  }

  async function save() {
    await persistDraft("manual");
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    persistDraftRef.current = persistDraft;
  }, [persistDraft]);

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
    setTermsId(createdId);
    setNewTermsLabel("");
    setNewTermsVersion("v1");
    setNewTermsMarkdown("");
    setSaveMessage("Global terms template created.");
  }

  async function finalize() {
    if (!activeInvoiceId) return;
    await finalizeInvoice({ id: activeInvoiceId });
    setSaveMessage("Invoice finalized.");
  }

  function loadCrewFromLinkedEvent() {
    if (!linkedEvent) {
      window.alert("No linked event found for this invoice.");
      return;
    }
    const blockLabelById = new Map(
      (linkedEvent.blocks ?? []).map((block) => [block._id, block.label || block.blockType]),
    );

    const assignmentRows: CrewRow[] = (linkedEvent.assignments ?? [])
      .filter((assignment) => assignment.assignmentType === "crew")
      .map((assignment) => ({
        label: assignment.roleLabel?.trim() || assignment.personName || "Crew Assignment",
        quantity: "1",
      }));

    const shiftRows: CrewRow[] = (linkedEvent.shifts ?? []).map((shift) => {
      const blockLabel = shift.scheduleBlockId ? blockLabelById.get(shift.scheduleBlockId) : undefined;
      const role = shift.role?.trim() || shift.personName?.trim() || "Crew Shift";
      const label = blockLabel ? `${blockLabel} — ${role}` : role;
      return {
        label,
        quantity: String(Math.max(0, Number(shift.hours ?? 0))),
      };
    });

    const merged = [...assignmentRows, ...shiftRows].filter((row) => row.label.trim().length > 0);
    if (!merged.length) {
      window.alert("No crew assignments or shifts found on the linked event.");
      return;
    }
    setCrewRows(merged);
    setSaveMessage("Loaded crew rows from linked event blocks and assignments.");
  }

  useEffect(() => {
    if (suppressAutoSaveOnceRef.current) {
      suppressAutoSaveOnceRef.current = false;
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void persistDraftRef.current("auto");
    }, 1000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [
    issueDate,
    dueDate,
    managerUserId,
    managerName,
    managerEmail,
    groupId,
    contactId,
    clientGroupName,
    clientGroupType,
    clientContactName,
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
    termsId,
    additionalTermsMarkdown,
    equipmentPackages,
    equipmentTypes,
    externalRentals,
    artists,
    crewRows,
    fees,
  ]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{activeInvoiceId ? "Edit Invoice" : "Create Invoice"}</h1>
          <p className="text-sm text-muted-foreground">Build invoice sections and export a print-ready PDF.</p>
        </div>
        <div className="flex gap-2">
          {linkedEvent ? (
            <Button type="button" variant="outline" asChild>
              <Link href={`/dashboard/events/${linkedEvent._id}`}>Open Linked Event</Link>
            </Button>
          ) : null}
          {activeInvoiceId ? (
            <Button type="button" variant="outline" asChild>
              <Link href={`/dashboard/financial-hub/invoices/${activeInvoiceId}/print`}>Print / PDF</Link>
            </Button>
          ) : null}
          {activeInvoiceId ? (
            <Button type="button" variant="outline" onClick={() => void finalize()}>
              Finalize
            </Button>
          ) : null}
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving..." : "Save Draft"}
          </Button>
        </div>
      </div>

      {saveMessage ? <p className="text-sm text-primary">{saveMessage}</p> : null}
      {saveWarning ? <p className="text-sm text-amber-600">{saveWarning}</p> : null}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {autoSaveState === "saving"
            ? "Saving..."
            : autoSaveState === "saved"
              ? "Saved just now"
              : autoSaveState === "error"
                ? "Auto-save failed"
                : "Auto-save idle"}
        </span>
        {autoSaveState === "error" ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void persistDraft("auto")}>
            Retry
          </Button>
        ) : null}
        {autoSaveError ? <span className="text-amber-600">{autoSaveError}</span> : null}
      </div>

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
              <option value="subsidized">Subsidized</option>
              <option value="nonSubsidized">Non-Subsidized</option>
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
          {invoiceData?.invoice ? (
            <div className="text-sm text-muted-foreground">
              Status: {invoiceData.invoice.clientApprovalStatus}
              {invoiceData.invoice.approvedAt ? ` • Approved at ${new Date(invoiceData.invoice.approvedAt).toLocaleString()}` : ""}
              {invoiceData.invoice.changesRequestedAt
                ? ` • Changes requested at ${new Date(invoiceData.invoice.changesRequestedAt).toLocaleString()}`
                : ""}
              {invoiceData.invoice.clientApprovalNote ? ` • Note: ${invoiceData.invoice.clientApprovalNote}` : ""}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Quote Terms & Conditions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Global terms template</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={termsId}
              onChange={(e) => setTermsId(e.target.value)}
            >
              <option value="">Default terms (from global settings)</option>
              {(termsDefinitions ?? []).map((row) => (
                <option key={row._id} value={row._id}>
                  {row.label} ({row.version})
                </option>
              ))}
            </select>
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
            <Label>Group</Label>
            <SearchableSelect
              value={groupId}
              onChange={onGroupChange}
              options={groupOptions}
              placeholder="Search groups..."
              emptyLabel="Select group"
              onCreate={openCreateGroup}
              createLabel="New Group"
            />
          </div>
          <div className="space-y-2">
            <Label>Contact</Label>
            <SearchableSelect
              value={contactId}
              onChange={onContactChange}
              options={contactOptions}
              placeholder={groupId ? "Search contacts..." : "Select group first"}
              emptyLabel={groupId ? "Select contact" : "Select group first"}
              onCreate={openCreateContact}
              createLabel="New Client"
            />
            {!groupId ? (
              <p className="text-xs text-muted-foreground">Clients are linked to a group. Select a group first.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Group type</Label>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={clientGroupType} onChange={(e) => setClientGroupType(e.target.value as typeof clientGroupType)}>
              <option value="">Select type</option>
              <option value="vso">VSO</option>
              <option value="house">House</option>
              <option value="department">Department</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          <Input placeholder="Group name" value={clientGroupName} onChange={(e) => setClientGroupName(e.target.value)} />
          <Input placeholder="Contact name" value={clientContactName} onChange={(e) => setClientContactName(e.target.value)} />
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
      <SectionCrew
        rows={crewRows}
        setRows={setCrewRows}
        rateMode={crewRateMode}
        canLoadFromEvent={Boolean(linkedEvent)}
        onLoadFromEvent={loadCrewFromLinkedEvent}
      />
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
            <CardHeader><CardTitle>New Group</CardTitle></CardHeader>
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
              <div className="flex gap-2">
                <Button type="button" onClick={() => void submitCreateGroup()}>Create Group</Button>
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
                Linked to group: <span className="font-medium">{clientGroupName || "Selected group"}</span>
              </p>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} />
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
  canLoadFromEvent,
  onLoadFromEvent,
}: {
  rows: CrewRow[];
  setRows: Dispatch<SetStateAction<CrewRow[]>>;
  rateMode: "normal" | "lead" | "custom";
  canLoadFromEvent: boolean;
  onLoadFromEvent: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            Crew (
            {rateMode === "custom" ? "Custom rate per row" : rateMode === "lead" ? "Lead rate from settings" : "Normal rate from settings"}
            )
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canLoadFromEvent}
            onClick={onLoadFromEvent}
          >
            Load Crew from Event
          </Button>
        </div>
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
            setRows((prev) => [...prev, { label: "", quantity: "1", rateUsd: rateMode === "custom" ? "0" : undefined }])
          }
        >
          Add crew row
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
