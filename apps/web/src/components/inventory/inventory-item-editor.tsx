"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  inventoryItemSchema,
  type InventoryItemFormValues,
} from "@/lib/validations/inventory";
import { SearchableSelect } from "./searchable-select";

type TypeOption = { _id: Id<"inventoryTypes">; name: string; model: string };
type LocationOption = { _id: Id<"storageLocations">; path: string };
type ItemOption = { _id: Id<"inventoryItems">; assetId: string; type?: { name: string; model: string; manufacturer?: string } | null };

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
      assetId: values.assetId,
      serialNumber: values.serialNumber || undefined,
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
              <TextFormField name="assetId" label="Asset ID" />
              <TextFormField name="serialNumber" label="Serial Number" />
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <SearchableSelect
                  value={form.watch("typeId")}
                  onChange={(value) => form.setValue("typeId", value, { shouldDirty: true })}
                  options={types.map((type) => ({
                    value: type._id,
                    label: `${type.name} - ${type.model}`,
                  }))}
                  placeholder="Search types..."
                  emptyLabel="Select type"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Storage Location</label>
                <SearchableSelect
                  value={form.watch("storageLocationId") ?? ""}
                  onChange={(value) =>
                    form.setValue("storageLocationId", value, { shouldDirty: true })
                  }
                  options={[
                    { value: "", label: "Unassigned" },
                    ...locations.map((location) => ({
                      value: location._id,
                      label: location.path,
                    })),
                  ]}
                  placeholder="Search storage locations..."
                  emptyLabel="Unassigned"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Contained In Asset</label>
                <SearchableSelect
                  value={form.watch("containedInAssetId") ?? ""}
                  onChange={(value) =>
                    form.setValue("containedInAssetId", value, { shouldDirty: true })
                  }
                  options={[
                    { value: "", label: "Not contained" },
                    ...items
                      .filter((item) => item._id !== editingId)
                      .map((item) => ({
                        value: item._id,
                        label: `${item.assetId} - ${formatTypeDisplay(item.type)}`,
                      })),
                  ]}
                  placeholder="Search container assets..."
                  emptyLabel="Not contained"
                />
              </div>
              <TextFormField name="status" label="Status" />
              <TextareaFormField name="notes" label="Notes" />
              <p className="text-xs text-muted-foreground">
                Public finder URL:{" "}
                <span className="font-mono">
                  {siteBase || "(set NEXT_PUBLIC_SITE_URL)"}/e/{form.watch("assetId") || "ASSETID"}
                </span>
              </p>
              {tier === "C" ? (
                <Button type="submit" disabled={form.saveStatus === "saving"}>
                  Create
                </Button>
              ) : null}
              {editingId ? (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              ) : null}
            </form>
          </Form>
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
