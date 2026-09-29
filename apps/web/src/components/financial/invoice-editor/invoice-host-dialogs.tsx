"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { splitContactName } from "@/lib/contact-name";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  EQUIPMENT_PRICING_MODE_OPTIONS,
  INVOICE_GROUP_TYPE_OPTIONS,
  type EquipmentPricingMode,
} from "@/lib/invoice-group-labels";

type HostType = (typeof INVOICE_GROUP_TYPE_OPTIONS)[number]["value"];

/**
 * Create a host organization from the quote's host picker. Offers the
 * existing host when the name (or an alias) already matches. Mount it keyed
 * on each open so the form starts from `initialName`.
 */
export function NewHostDialog({
  open,
  onOpenChange,
  initialName,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  /** Called with the created (or matched existing) host id. */
  onPicked: (groupId: Id<"invoiceGroups">) => void;
}) {
  const { alert } = useAppDialog();
  const createGroup = useMutation(api.invoiceGroups.create);
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<HostType>("department");
  const [pricingMode, setPricingMode] = useState<EquipmentPricingMode>("subsidized");
  const [creating, setCreating] = useState(false);
  const suggestion = useQuery(
    api.invoiceGroups.suggestByName,
    open && name.trim().length >= 2 ? { name: name.trim() } : "skip",
  );

  function pick(groupId: Id<"invoiceGroups">) {
    onPicked(groupId);
    onOpenChange(false);
  }

  async function submit() {
    if (!name.trim()) return;
    // An exact or alias match is the same host: use it rather than create a duplicate.
    if (suggestion && suggestion.matchKind !== "similar") {
      pick(suggestion._id);
      return;
    }
    setCreating(true);
    try {
      const id = await createGroup({
        name: name.trim(),
        type,
        equipmentPricingMode: pricingMode,
        active: true,
      });
      pick(id);
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Failed to create host."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="invoice-new-host-dialog">
        <DialogHeader>
          <DialogTitle>New host</DialogTitle>
          <DialogDescription>The organization this quote bills. Its pricing mode applies to the quote.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="invoice-new-host-name">Name</Label>
            <Input id="invoice-new-host-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          {suggestion ? (
            <div className="space-y-2 border border-status-amber-500/40 bg-status-amber-500/10 px-3 py-2 text-sm">
              <p>
                Did you mean <span className="font-medium">{suggestion.name}</span>
                {suggestion.matchKind === "alias" ? " (alias match)" : ""}?
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => pick(suggestion._id)}>
                Use existing host
              </Button>
            </div>
          ) : null}
          <div className="space-y-2">
            <span className="text-sm font-medium" id="invoice-new-host-type">
              Type
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="invoice-new-host-type"
              value={type}
              onValueChange={(value) => value && setType(value as HostType)}
              className="flex w-full flex-wrap"
            >
              {INVOICE_GROUP_TYPE_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium" id="invoice-new-host-pricing">
              Equipment pricing
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="invoice-new-host-pricing"
              value={pricingMode}
              onValueChange={(value) => value && setPricingMode(value as EquipmentPricingMode)}
              className="flex w-full"
            >
              {EQUIPMENT_PRICING_MODE_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? "Creating…" : "Create host"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Create a client contact under the selected host. Mount it keyed on each
 * open so the form starts from `initialName`.
 */
export function NewClientDialog({
  open,
  onOpenChange,
  initialName,
  groupId,
  hostName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  groupId: Id<"invoiceGroups">;
  hostName?: string;
  onCreated: (contactId: Id<"invoiceContacts">) => void;
}) {
  const { alert } = useAppDialog();
  const createContact = useMutation(api.invoiceContacts.create);
  const [initial] = useState(() => splitContactName(initialName));
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [creating, setCreating] = useState(false);

  async function submit() {
    if (!firstName.trim() || !lastName.trim()) return;
    setCreating(true);
    try {
      const id = await createContact({
        groupId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        active: true,
      });
      onCreated(id);
      onOpenChange(false);
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Failed to create client."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="invoice-new-client-dialog">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>
            A contact at <span className="font-medium text-foreground">{hostName || "the selected host"}</span>.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invoice-new-client-first">First name</Label>
              <Input id="invoice-new-client-first" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-new-client-last">Last name</Label>
              <Input id="invoice-new-client-last" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoice-new-client-email">Email</Label>
            <Input
              id="invoice-new-client-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoice-new-client-phone">Phone</Label>
            <Input id="invoice-new-client-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!firstName.trim() || !lastName.trim() || creating}>
              {creating ? "Creating…" : "Create client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
