"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/lib/convex-api";
import { api } from "@/lib/convex-api";
import { formatContactFullName } from "@/lib/contact-name";
import {
  INVOICE_GROUP_TYPE_LABELS,
  INVOICE_GROUP_TYPE_OPTIONS,
  EQUIPMENT_PRICING_MODE_LABELS,
  EQUIPMENT_PRICING_MODE_OPTIONS,
  type EquipmentPricingMode,
} from "@/lib/invoice-group-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type GroupType = "vso" | "house" | "department" | "individual";

export function FinancialHubOrganizationsClient() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<Id<"invoiceGroups"> | "">("");
  const [message, setMessage] = useState<string | null>(null);

  const groups = useQuery(api.invoiceGroups.listForAdmin, { includeInactive });
  const contacts = useQuery(
    api.invoiceContacts.listForAdmin,
    selectedGroupId
      ? { groupId: selectedGroupId, includeInactive }
      : "skip",
  );

  const createGroup = useMutation(api.invoiceGroups.create);
  const updateGroup = useMutation(api.invoiceGroups.update);
  const archiveGroup = useMutation(api.invoiceGroups.archive);
  const createContact = useMutation(api.invoiceContacts.create);
  const updateContact = useMutation(api.invoiceContacts.update);
  const archiveContact = useMutation(api.invoiceContacts.archive);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState<GroupType>("vso");
  const [newGroupEquipmentPricingMode, setNewGroupEquipmentPricingMode] =
    useState<EquipmentPricingMode>("subsidized");
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupType, setEditGroupType] = useState<GroupType>("vso");
  const [editGroupEquipmentPricingMode, setEditGroupEquipmentPricingMode] =
    useState<EquipmentPricingMode>("subsidized");

  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [newContactLastName, setNewContactLastName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  const groupRows = useMemo(() => groups ?? [], [groups]);
  const contactRows = useMemo(() => contacts ?? [], [contacts]);
  const selectedGroup = groupRows.find((group) => group._id === selectedGroupId);

  function selectGroup(groupId: Id<"invoiceGroups">) {
    setSelectedGroupId(groupId);
    const group = groupRows.find((row) => row._id === groupId);
    if (group) {
      setEditGroupName(group.name);
      setEditGroupType(group.type);
      setEditGroupEquipmentPricingMode(group.equipmentPricingMode);
    }
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    setMessage(null);
    const id = await createGroup({
      name: newGroupName.trim(),
      type: newGroupType,
      equipmentPricingMode: newGroupEquipmentPricingMode,
      active: true,
    });
    setNewGroupName("");
    setSelectedGroupId(id);
    setMessage("Host organization created.");
  }

  async function handleUpdateGroup() {
    if (!selectedGroupId || !editGroupName.trim()) return;
    setMessage(null);
    await updateGroup({
      id: selectedGroupId,
      name: editGroupName.trim(),
      type: editGroupType,
      equipmentPricingMode: editGroupEquipmentPricingMode,
    });
    setMessage("Host organization updated.");
  }

  async function handleArchiveGroup() {
    if (!selectedGroupId) return;
    if (!window.confirm("Archive this host organization? It will no longer appear in invoice dropdowns.")) {
      return;
    }
    setMessage(null);
    await archiveGroup({ id: selectedGroupId });
    setSelectedGroupId("");
    setMessage("Host organization archived.");
  }

  async function handleCreateContact() {
    if (!selectedGroupId || !newContactFirstName.trim() || !newContactLastName.trim()) return;
    setMessage(null);
    await createContact({
      groupId: selectedGroupId,
      firstName: newContactFirstName.trim(),
      lastName: newContactLastName.trim(),
      email: newContactEmail.trim() || undefined,
      phone: newContactPhone.trim() || undefined,
      active: true,
    });
    setNewContactFirstName("");
    setNewContactLastName("");
    setNewContactEmail("");
    setNewContactPhone("");
    setMessage("Client contact created.");
  }

  async function handleArchiveContact(contactId: Id<"invoiceContacts">) {
    if (!window.confirm("Archive this client contact?")) return;
    setMessage(null);
    await archiveContact({ id: contactId });
    setMessage("Client contact archived.");
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-primary">{message}</p> : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Host organizations</CardTitle>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show archived
          </label>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Host orgs appear on invoices and booking requests. Link invoices to a host using the dropdown — not freeform text.
          </p>

          <div className="grid gap-3 md:grid-cols-[1fr_160px_180px_120px]">
            <Input
              placeholder="New host name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={newGroupType}
              onChange={(e) => setNewGroupType(e.target.value as GroupType)}
            >
              {INVOICE_GROUP_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            <Button type="button" onClick={() => void handleCreateGroup()}>
              Add host
            </Button>
          </div>

          <div className="space-y-2">
            {groupRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No host organizations yet.</p>
            ) : (
              groupRows.map((group) => (
                <button
                  key={group._id}
                  type="button"
                  onClick={() => selectGroup(group._id)}
                  className={`grid w-full gap-2 rounded-md border p-3 text-left transition hover:bg-muted/40 md:grid-cols-[1fr_120px_140px_100px_80px] ${
                    selectedGroupId === group._id ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <span className="font-medium">{group.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {INVOICE_GROUP_TYPE_LABELS[group.type] ?? group.type}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {EQUIPMENT_PRICING_MODE_LABELS[group.equipmentPricingMode]}
                  </span>
                  <span className="text-sm text-muted-foreground">{group.contactCount} clients</span>
                  <span className="text-sm text-muted-foreground">{group.active ? "Active" : "Archived"}</span>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {selectedGroup ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit host: {selectedGroup.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={editGroupType}
                  onChange={(e) => setEditGroupType(e.target.value as GroupType)}
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
                  value={editGroupEquipmentPricingMode}
                  onChange={(e) =>
                    setEditGroupEquipmentPricingMode(e.target.value as EquipmentPricingMode)
                  }
                >
                  {EQUIPMENT_PRICING_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Applied when this host is selected on a new invoice.
                </p>
              </div>
              <div className="flex items-end gap-2">
                <Button type="button" onClick={() => void handleUpdateGroup()}>
                  Save host
                </Button>
                {selectedGroup.active ? (
                  <Button type="button" variant="outline" onClick={() => void handleArchiveGroup()}>
                    Archive
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">Client contacts</p>
              <div className="mb-3 grid gap-3 md:grid-cols-5">
                <Input
                  placeholder="First name"
                  value={newContactFirstName}
                  onChange={(e) => setNewContactFirstName(e.target.value)}
                />
                <Input
                  placeholder="Last name"
                  value={newContactLastName}
                  onChange={(e) => setNewContactLastName(e.target.value)}
                />
                <Input
                  placeholder="Email"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                />
                <Input
                  placeholder="Phone"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => void handleCreateContact()}>
                  Add client
                </Button>
              </div>

              <div className="space-y-2">
                {contactRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No clients linked to this host yet.</p>
                ) : (
                  contactRows.map((contact) => (
                    <ContactRow
                      key={contact._id}
                      contact={contact}
                      onSave={async (patch) => {
                        await updateContact({ id: contact._id, ...patch });
                        setMessage("Client contact updated.");
                      }}
                      onArchive={() => void handleArchiveContact(contact._id)}
                    />
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ContactRow({
  contact,
  onSave,
  onArchive,
}: {
  contact: {
    _id: Id<"invoiceContacts">;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    active: boolean;
  };
  onSave: (patch: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  }) => Promise<void>;
  onArchive: () => void;
}) {
  const [firstName, setFirstName] = useState(contact.firstName);
  const [lastName, setLastName] = useState(contact.lastName);
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_1fr_1fr_160px]">
      <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
      <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave({
              firstName: firstName.trim() || undefined,
              lastName: lastName.trim() || undefined,
              email: email.trim() || undefined,
              phone: phone.trim() || undefined,
            }).finally(() => setSaving(false));
          }}
        >
          Save
        </Button>
        {contact.active ? (
          <Button type="button" size="sm" variant="outline" onClick={onArchive}>
            Archive
          </Button>
        ) : (
          <span className="self-center text-xs text-muted-foreground">Archived</span>
        )}
      </div>
    </div>
  );
}
