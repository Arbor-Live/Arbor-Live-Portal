"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  inventoryItemSchema,
  type InventoryItemFormValues,
} from "@/lib/validations/inventory";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { inventoryItemLabel } from "./constants";
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
}: {
  editingId: Id<"inventoryItems"> | null;
  initial: InventoryItemFormValues;
  types: TypeOption[];
  locations: LocationOption[];
  items: ItemOption[];
  siteBase: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const createItem = useMutation(api.inventoryItems.create);
  const updateItem = useMutation(api.inventoryItems.update);
  const replaceContainedAssets = useMutation(api.inventoryItems.replaceContainedAssets);
  const children = useQuery(api.inventoryItems.getChildren, editingId ? { id: editingId } : "skip");
  const [containsScanRaw, setContainsScanRaw] = useState("");
  const [containsScanError, setContainsScanError] = useState<string | null>(null);
  const [containsError, setContainsError] = useState<string | null>(null);
  const containsScan = useQuery(
    api.inventoryItems.resolveByScan,
    containsScanRaw.trim() ? { raw: containsScanRaw } : "skip",
  );

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
    if (!editingId) return;
    setContainsError(null);
    try {
      await replaceContainedAssets({
        containerId: editingId,
        childIds: childIds as Id<"inventoryItems">[],
      });
    } catch (error) {
      setContainsError(getConvexErrorMessage(error, "Could not update contained assets."));
    }
  }

  useEffect(() => {
    if (!containsScanRaw.trim()) return;
    if (containsScan === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- consume the one-shot contains-scan resolution
      setContainsScanError(`No item found for “${containsScanRaw.trim()}”.`);
      setContainsScanRaw("");
      return;
    }
    if (containsScan) {
      const ids = (children ?? []).map((child) => child._id);
      if (!ids.includes(containsScan._id)) void setChildren([...ids, containsScan._id]);
      setContainsScanRaw("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the scan result only
  }, [containsScan]);

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

  const tier = "C";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Item" : "Create Item"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => form.runMutation(() => persist(values)))}
              className="space-y-3"
            >
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
                errors={
                  form.formState.errors.assetId
                    ? {
                        assetId:
                          form.formState.errors.assetId.message ??
                          "Add an Asset ID or Serial Number",
                      }
                    : undefined
                }
                types={types.map((type) => ({ value: type._id, label: `${type.name} - ${type.model}` }))}
                locations={locations.map((location) => ({
                  value: location._id,
                  label: location.path,
                }))}
                containerOptions={containerOptions}
                testIdPrefix="item"
                siteBase={siteBase}
              />
              {tier === "C" ? (
                <Button type="submit" disabled={form.saveStatus === "saving"}>
                  {editingId ? "Save" : "Create"}
                </Button>
              ) : null}
              {editingId ? (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              ) : null}
            </form>
          </Form>
          {editingId ? (
            <div className="space-y-3 border-t pt-3">
              <ContainsEditor
                value={(children ?? []).map((child) => child._id)}
                onChange={setChildren}
                options={containsOptions}
                onScan={(raw) => setContainsScanRaw(raw)}
                title={`Contains (${children?.length ?? 0})`}
                emptyLabel="Nothing inside yet — scan or add the contents"
              />
              {containsScanError ? (
                <p className="text-sm text-destructive">{containsScanError}</p>
              ) : null}
              {containsError ? (
                <p className="text-sm text-destructive">{containsError}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <FormSaveBar
        tier={tier}
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={form.formState.isDirty}
        saveLabel={editingId ? "Save" : "Create"}
        onSave={() => void form.handleSubmit((values) => form.runMutation(() => persist(values)))()}
        onDiscard={() => {
          form.reset(initial);
          onCancel();
        }}
        onRetry={() => void form.handleSubmit((values) => form.runMutation(() => persist(values)))()}
      />
    </>
  );
}
