"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BuildingsIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import {
  EQUIPMENT_PRICING_MODE_OPTIONS,
  INVOICE_GROUP_TYPE_LABELS,
  INVOICE_GROUP_TYPE_OPTIONS,
  type EquipmentPricingMode,
} from "@/lib/invoice-group-labels";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";
import { MultiSelectFilter } from "@/components/inventory/multi-select-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";

type HostType = "vso" | "house" | "department" | "individual";

/** Active host organizations as select options. */
export function useHostGroupOptions() {
  const hostGroups = useQuery(api.invoiceGroups.list, { activeOnly: true });
  return useMemo<SearchableSelectOption[]>(
    () =>
      (hostGroups ?? []).map((group) => ({
        value: group._id,
        label: group.name,
        description: INVOICE_GROUP_TYPE_LABELS[group.type] ?? group.type,
        keywords: group.type,
      })),
    [hostGroups],
  );
}

function NewHostDialog({
  open,
  initialName,
  onOpenChange,
  onSelected,
}: {
  open: boolean;
  initialName: string;
  onOpenChange: (open: boolean) => void;
  onSelected: (hostGroupId: string) => void;
}) {
  const { alert } = useAppDialog();
  const createHostGroup = useMutation(api.invoiceGroups.create);
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<HostType>("department");
  const [pricingMode, setPricingMode] = useState<EquipmentPricingMode>("subsidized");
  const [creating, setCreating] = useState(false);
  const suggestion = useQuery(
    api.invoiceGroups.suggestByName,
    open && name.trim().length >= 2 ? { name: name.trim() } : "skip",
  );

  function select(id: string) {
    onSelected(id);
    onOpenChange(false);
  }

  async function submit() {
    if (!name.trim() || creating) return;
    if (suggestion && suggestion.matchKind !== "similar") {
      select(suggestion._id);
      return;
    }
    setCreating(true);
    try {
      const id = await createHostGroup({
        name: name.trim(),
        type,
        equipmentPricingMode: pricingMode,
        active: true,
      });
      select(id);
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Failed to create host."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BuildingsIcon className="size-4" />
            New host
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          {suggestion ? (
            <div className="border border-status-amber-500/40 bg-status-amber-500/10 px-3 py-2 text-sm">
              <p>
                Did you mean <span className="font-medium">{suggestion.name}</span>
                {suggestion.matchKind === "alias" ? " (alias match)" : ""}?
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => select(suggestion._id)}
              >
                Use existing host
              </Button>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>Type</Label>
            <SearchableSelect
              value={type}
              onChange={(value) => setType(value as HostType)}
              options={[...INVOICE_GROUP_TYPE_OPTIONS]}
              placeholder="Search types..."
            />
          </div>
          <div className="space-y-1">
            <Label>Equipment pricing</Label>
            <SearchableSelect
              value={pricingMode}
              onChange={(value) => setPricingMode(value as EquipmentPricingMode)}
              options={[...EQUIPMENT_PRICING_MODE_OPTIONS]}
              placeholder="Search pricing..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={creating} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!name.trim() || creating} onClick={() => void submit()}>
            {creating ? "Creating…" : "Create host"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PrimaryHostSelect({
  value,
  onChange,
  options,
  allowCreate,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  allowCreate: boolean;
}) {
  const [createName, setCreateName] = useState<string | null>(null);
  return (
    <>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Search host organizations…"
        emptyLabel="No host"
        clearable
        clearLabel="No host"
        onCreate={allowCreate ? (query) => setCreateName(query) : undefined}
        createLabel="New Host"
      />
      {createName !== null ? (
        <NewHostDialog
          open
          initialName={createName}
          onOpenChange={(open) => {
            if (!open) setCreateName(null);
          }}
          onSelected={onChange}
        />
      ) : null}
    </>
  );
}

export function CoHostsSelect({
  values,
  onChange,
  options,
  primaryHostGroupId,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: SearchableSelectOption[];
  primaryHostGroupId: string;
}) {
  return (
    <MultiSelectFilter
      label="Co-hosts"
      hideLabel
      placeholder="Search co-hosts…"
      values={values}
      onChange={onChange}
      options={options.filter((option) => option.value !== primaryHostGroupId)}
      emptyLabel="No co-hosts"
    />
  );
}
