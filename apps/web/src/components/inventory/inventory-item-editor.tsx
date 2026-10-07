"use client";

import { useEffect, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DetailSheetFooter, SheetSection } from "@/components/list-page";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  inventoryItemSchema,
  type InventoryItemFormValues,
} from "@/lib/validations/inventory";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { inventoryItemLabel } from "./constants";
import type { ScanOutcome } from "./use-barcode-camera";
import { ContainsEditor, type ContainsOption } from "./contains-editor";
import { InventoryItemDetails } from "./inventory-item-details";

type TypeOption = { _id: Id<"inventoryTypes">; name: string; model: string };
type LocationOption = { _id: Id<"storageLocations">; path: string };
type ItemOption = {
  _id: Id<"inventoryItems">;
  assetId?: string;
  serialNumber?: string;
  type?: { name: string; model: string; manufacturer?: string } | null;
};

function formatTypeDisplay(type: ItemOption["type"]) {
  if (!type) return "Unknown type";
  const maker = type.manufacturer?.trim();
  const sameNameModel = type.name.trim().toLowerCase() === type.model.trim().toLowerCase();
  const core = sameNameModel ? type.name : `${type.name} / ${type.model}`;
  return maker ? `${maker} ${core}` : core;
}

export function InventoryItemEditor({
  editingId,
  initial,
  types,
  locations,
  items,
  siteBase,
  onCancel,
  onSaved,
  footerStart,
}: {
  editingId: Id<"inventoryItems"> | null;
  initial: InventoryItemFormValues;
  types: TypeOption[];
  locations: LocationOption[];
  items: ItemOption[];
  siteBase: string;
  onCancel: () => void;
  onSaved: () => void;
  /** Left side of the panel footer: the item's destructive and secondary actions. */
  footerStart?: React.ReactNode;
}) {
  const createItem = useMutation(api.inventoryItems.create);
  const updateItem = useMutation(api.inventoryItems.update);
  const replaceContainedAssets = useMutation(api.inventoryItems.replaceContainedAssets);
  const children = useQuery(api.inventoryItems.getChildren, editingId ? { id: editingId } : "skip");
  const [containsScanError, setContainsScanError] = useState<string | null>(null);
  const [containsError, setContainsError] = useState<string | null>(null);
  const [containerScanError, setContainerScanError] = useState<string | null>(null);
  const convex = useConvex();

  const form = useConvexForm<InventoryItemFormValues>({
    schema: inventoryItemSchema,
    defaultValues: initial,
    mode: "onChange",
  });

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset(initial);
  }, [initial, form]);

  const persist = async (values: InventoryItemFormValues) => {
    const payload = {
      assetId: values.assetId?.trim() || undefined,
      serialNumber: values.serialNumber?.trim() || undefined,
      typeId: values.typeId as Id<"inventoryTypes">,
      storageLocationId: values.storageLocationId
        ? (values.storageLocationId as Id<"storageLocations">)
        : undefined,
      containedInAssetId: values.containedInAssetId
        ? (values.containedInAssetId as Id<"inventoryItems">)
        : undefined,
      status: values.status || undefined,
      notes: values.notes || undefined,
    };
    if (editingId) {
      await updateItem({ id: editingId, ...payload });
    } else {
      await createItem(payload);
    }
    onSaved();
    if (!editingId) form.reset(initial);
  };

  async function setChildren(childIds: string[]) {
    if (!editingId) return false;
    setContainsError(null);
    try {
      await replaceContainedAssets({
        containerId: editingId,
        childIds: childIds as Id<"inventoryItems">[],
      });
      return true;
    } catch (error) {
      setContainsError(getConvexErrorMessage(error, "Could not update contained assets."));
      return false;
    }
  }

  /** Resolve and save a scanned child; awaited, so a batch camera waits for it before the next read. */
  async function scanContains(raw: string): Promise<ScanOutcome> {
    const found = await convex.query(api.inventoryItems.resolveByScan, { raw });
    if (!found) {
      setContainsScanError(`No item found for “${raw.trim()}”.`);
      return "rejected";
    }
    setContainsScanError(null);
    const ids = (children ?? []).map((child) => child._id);
    if (ids.includes(found._id)) return "accepted";
    return (await setChildren([...ids, found._id])) ? "accepted" : "rejected";
  }

  /** Resolve a scanned or typed container (tag, link, short link) the same way the scanners do. */
  async function scanContainer(raw: string): Promise<ScanOutcome> {
    const found = await convex.query(api.inventoryItems.resolveByScan, { raw });
    if (!found) {
      setContainerScanError(`No item found for “${raw.trim()}”.`);
      return "rejected";
    }
    if (found._id === editingId) {
      setContainerScanError("An item can't be contained in itself.");
      return "rejected";
    }
    setContainerScanError(null);
    form.setValue("containedInAssetId", found._id, { shouldDirty: true });
    return "accepted";
  }

  const values = form.watch();
  const onDetailsChange = (patch: Partial<InventoryItemFormValues>) => {
    for (const [key, value] of Object.entries(patch)) {
      form.setValue(key as never, value as never, { shouldDirty: true });
    }
  };

  const otherItems = items.filter((item) => item._id !== editingId);
  const containerOptions = otherItems.map((item) => ({
    value: item._id,
    assetId: item.assetId ?? "",
    label: `${inventoryItemLabel(item)} - ${formatTypeDisplay(item.type)}`,
  }));
  const containsOptions: ContainsOption[] = otherItems.map((item) => ({
    value: item._id,
    assetId: item.assetId ?? "",
    label: formatTypeDisplay(item.type),
  }));

  const saving = form.saveStatus === "saving";
  const submit = () => void form.handleSubmit((values) => form.runMutation(() => persist(values)))();

  return (
    <Form {...form}>
      <form
        className="flex min-h-full flex-col"
        data-testid="item-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <SheetSection title="Details">
          <InventoryItemDetails
            values={{
              assetId: values.assetId ?? "",
              serialNumber: values.serialNumber ?? "",
              typeId: values.typeId,
              storageLocationId: values.storageLocationId ?? "",
              containedInAssetId: values.containedInAssetId ?? "",
              status: values.status ?? "",
              notes: values.notes ?? "",
            }}
            onChange={onDetailsChange}
            errors={{
              assetId: form.formState.errors.assetId
                ? (form.formState.errors.assetId.message ?? "Add an Asset ID or Serial Number")
                : undefined,
              containedInAssetId: containerScanError ?? undefined,
            }}
            onScanContainedIn={scanContainer}
            types={types.map((type) => ({ value: type._id, label: `${type.name} - ${type.model}` }))}
            locations={locations.map((location) => ({
              value: location._id,
              label: location.path,
            }))}
            containerOptions={containerOptions}
            testIdPrefix="item"
            siteBase={siteBase}
          />
        </SheetSection>
        {editingId ? (
          <SheetSection title="Contains">
            <ContainsEditor
              value={(children ?? []).map((child) => child._id)}
              onChange={setChildren}
              options={containsOptions}
              onScan={scanContains}
              title={`Contains (${children?.length ?? 0})`}
              emptyLabel="Nothing inside yet — scan or add the contents"
            />
            {containsScanError ? <p className="text-sm text-destructive">{containsScanError}</p> : null}
            {containsError ? <p className="text-sm text-destructive">{containsError}</p> : null}
            <p className="text-xs text-muted-foreground">
              Contents are saved as you add or remove them, and take this item&apos;s location.
            </p>
          </SheetSection>
        ) : null}
        <DetailSheetFooter start={footerStart}>
          {form.saveError ? (
            <span className="max-w-48 text-xs text-destructive" role="alert">
              {form.saveError}
            </span>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || (Boolean(editingId) && !form.formState.isDirty)}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Create item"}
          </Button>
        </DetailSheetFooter>
      </form>
    </Form>
  );
}
