"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
type CrewRow = { label: string; quantity: string };
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
  const [crewRateMode, setCrewRateMode] = useState<"normal" | "ot">("normal");
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
  const [activeInvoiceId, setActiveInvoiceId] = useState<Id<"invoices"> | undefined>(invoiceId);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState<"vso" | "house" | "department" | "individual">("department");
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveInvoiceId(invoice._id);
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
    setCrewRateMode(invoice.crewRateMode);
    setDiscountType(invoice.discountType);
    setDiscountValue(invoice.discountValue.toString());
    setNotes(invoice.notes ?? "");

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
        .map((row) => ({ label: row.label, quantity: row.quantity.toString() })),
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
      rows.push({
        section: "crew",
        order: order++,
        label: row.label.trim(),
        quantity: Number(row.quantity),
        rateUsd: crewRateMode === "ot" ? (settings?.crewOtRateUsd ?? 0) : (settings?.crewNormalRateUsd ?? 0),
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

  async function save() {
    if (!managerUserId || !managerName.trim()) {
      window.alert("Select a manager.");
      return;
    }
    const lineItems = buildLineItems();
    if (!lineItems.length) {
      window.alert("Add at least one line item.");
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    setSaveWarning(null);
    try {
      const payload = {
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
        lineItems,
      };
      if (activeInvoiceId) {
        const result = await updateDraft({ id: activeInvoiceId, ...payload });
        setSaveWarning(result.warning ?? null);
        setSaveMessage("Invoice updated.");
      } else {
        const result = await createDraft(payload);
        setActiveInvoiceId(result.id);
        setSaveWarning(result.warning ?? null);
        setSaveMessage("Invoice draft created.");
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not save invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    if (!activeInvoiceId) return;
    await finalizeInvoice({ id: activeInvoiceId });
    setSaveMessage("Invoice finalized.");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{activeInvoiceId ? "Edit Invoice" : "Create Invoice"}</h1>
          <p className="text-sm text-muted-foreground">Build invoice sections and export a print-ready PDF.</p>
        </div>
        <div className="flex gap-2">
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
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={crewRateMode} onChange={(e) => setCrewRateMode(e.target.value as "normal" | "ot")}>
              <option value="normal">Normal</option>
              <option value="ot">OT</option>
            </select>
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
      <SectionCrew rows={crewRows} setRows={setCrewRows} rateMode={crewRateMode} />
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
}: {
  rows: CrewRow[];
  setRows: Dispatch<SetStateAction<CrewRow[]>>;
  rateMode: "normal" | "ot";
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Crew ({rateMode === "ot" ? "OT" : "Normal"} rates from settings)</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, idx) => (
          <div key={`crew-${idx}`} className="grid gap-2 md:grid-cols-3">
            <Input placeholder="Crew role" value={row.label} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)))} />
            <Input placeholder="Qty/hours" value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
            <Button type="button" variant="outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, { label: "", quantity: "1" }])}>Add crew row</Button>
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
