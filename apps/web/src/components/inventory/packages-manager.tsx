"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  inventoryPackageSchema,
  type InventoryPackageFormValues,
} from "@/lib/validations/inventory";
import { formatCurrency } from "./constants";
import { SearchableSelect } from "./searchable-select";

type PackageItemRow = { typeId: string; quantity: string };

type PublicPackageBucket = "lighting" | "sound" | "environmental" | "staging" | "misc";

const defaultPackageValues: InventoryPackageFormValues = {
  name: "",
  description: "",
  subsidizedPackagePriceUsd: 0,
  nonSubsidizedPackagePriceUsd: 0,
  active: true,
  publicListing: false,
  publicBucket: "",
  publicHeroImageUrl: "",
  publicSlug: "",
  items: [{ typeId: "", quantity: 1 }],
};

const publicBucketLabels: Record<PublicPackageBucket, string> = {
  lighting: "Lighting",
  sound: "Sound",
  environmental: "Environmental",
  staging: "Staging",
  misc: "Misc",
};

export function PackagesManager() {
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"name" | "price" | "value">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [itemRows, setItemRows] = useState<PackageItemRow[]>([{ typeId: "", quantity: "1" }]);

  const packages = useQuery(api.inventoryPackages.list, {});
  const types = useQuery(api.inventoryTypes.list, {});
  type InventoryTypeRow = NonNullable<typeof types>[number];
  const createPackage = useMutation(api.inventoryPackages.create);
  const updatePackage = useMutation(api.inventoryPackages.update);
  const removePackage = useMutation(api.inventoryPackages.remove);

  const packageForm = useConvexForm<InventoryPackageFormValues>({
    schema: inventoryPackageSchema,
    defaultValues: defaultPackageValues,
    mode: "onTouched",
  });

  useEffect(() => {
    const parsedItems = itemRows
      .filter((row) => row.typeId && Number(row.quantity) > 0)
      .map((row) => ({ typeId: row.typeId, quantity: Number(row.quantity) }));
    packageForm.setValue("items", parsedItems.length ? parsedItems : [{ typeId: "", quantity: 1 }], {
      shouldDirty: true,
    });
  }, [itemRows, packageForm]);

  function buildPackagePayload(values: InventoryPackageFormValues) {
    return {
      name: values.name,
      description: values.description || undefined,
      packagePriceCents: Math.round(values.nonSubsidizedPackagePriceUsd * 100),
      subsidizedPackagePriceUsd: values.subsidizedPackagePriceUsd,
      nonSubsidizedPackagePriceUsd: values.nonSubsidizedPackagePriceUsd,
      active: values.active,
      publicListing: values.publicListing,
      publicBucket:
        values.publicListing && values.publicBucket
          ? (values.publicBucket as PublicPackageBucket)
          : undefined,
      publicHeroImageUrl: values.publicHeroImageUrl?.trim() || undefined,
      publicSlug: values.publicSlug?.trim() || undefined,
      items: values.items
        .filter((row) => row.typeId && row.quantity > 0)
        .map((row) => ({ typeId: row.typeId as Id<"inventoryTypes">, quantity: row.quantity })),
    };
  }

  const onSubmitPackage = packageForm.submitMutation(async (values) => {
    const payload = buildPackagePayload(values);
    if (editingId) {
      await updatePackage({ id: editingId as Id<"inventoryPackages">, ...payload });
    } else {
      await createPackage(payload);
    }
    closeEditor();
  });
  const typeLookup = useMemo(() => {
    const map = new Map<string, InventoryTypeRow>();
    for (const type of types ?? []) {
      map.set(type._id, type);
    }
    return map;
  }, [types]);
  const filteredPackages = useMemo(() => {
    const rows = [...(packages ?? [])].filter((pkg) =>
      pkg.name.toLowerCase().includes(search.trim().toLowerCase()),
    );
    rows.sort((a, b) => {
      const direction = sortDir === "asc" ? 1 : -1;
      if (sortBy === "price") return (a.packagePriceCents - b.packagePriceCents) * direction;
      if (sortBy === "value") {
        return ((a.estimatedRentalValueUsd ?? 0) - (b.estimatedRentalValueUsd ?? 0)) * direction;
      }
      return a.name.localeCompare(b.name) * direction;
    });
    return rows;
  }, [packages, search, sortBy, sortDir]);

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    packageForm.reset(defaultPackageValues);
    packageForm.resetSaveState();
    setItemRows([{ typeId: "", quantity: "1" }]);
  }

  const suggestedPricing = useMemo(() => {
    return itemRows.reduce(
      (acc, row) => {
        const qty = Number(row.quantity || "0");
        if (!row.typeId || qty <= 0) return acc;
        const type = typeLookup.get(row.typeId);
        if (!type) return acc;
        acc.subsidized += (type.subsidizedRentalPriceUsd ?? 0) * qty;
        acc.nonSubsidized +=
          (type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0) * qty;
        return acc;
      },
      { subsidized: 0, nonSubsidized: 0 },
    );
  }, [itemRows, typeLookup]);

  async function bulkDeleteSelected() {
    await Promise.all(selectedIds.map((id) => removePackage({ id: id as never })));
    setSelectedIds([]);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Packages</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Search packages" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            >
              <option value="name">Sort: Name</option>
              <option value="price">Sort: Price</option>
              <option value="value">Sort: Est. Value</option>
            </select>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={sortDir}
              onChange={(event) => setSortDir(event.target.value as typeof sortDir)}
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
            <Button
              type="button"
              variant="destructive"
              disabled={!selectedIds.length}
              onClick={() => void bulkDeleteSelected()}
            >
              Delete Selected ({selectedIds.length})
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEditingId(null);
                packageForm.reset(defaultPackageValues);
                packageForm.resetSaveState();
                setItemRows([{ typeId: "", quantity: "1" }]);
                setEditorOpen(true);
              }}
            >
              Create Package
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-auto rounded-md border">
            <table className="min-w-full table-fixed text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">
                    <input
                      type="checkbox"
                      checked={filteredPackages.length > 0 && selectedIds.length === filteredPackages.length}
                      onChange={(event) =>
                        setSelectedIds(event.target.checked ? filteredPackages.map((pkg) => pkg._id) : [])
                      }
                    />
                  </th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Public section</th>
                  <th className="p-2 text-left">Subsidized</th>
                  <th className="p-2 text-left">Non-Subsidized</th>
                  <th className="p-2 text-left">Est. Subsidized</th>
                  <th className="p-2 text-left">Est. Non-Subsidized</th>
                  <th className="p-2 text-left">Items</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPackages.map((pkg) => (
                  <tr key={pkg._id} className="border-t align-top">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(pkg._id)}
                        onChange={(event) =>
                          setSelectedIds((prev) =>
                            event.target.checked
                              ? [...prev, pkg._id]
                              : prev.filter((id) => id !== pkg._id),
                          )
                        }
                      />
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{pkg.name}</div>
                      <div className="break-words text-xs text-muted-foreground">
                        {pkg.description || "No description"}
                      </div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {pkg.publicListing && pkg.publicBucket ? (
                        <span className="text-foreground">{publicBucketLabels[pkg.publicBucket]}</span>
                      ) : pkg.publicListing ? (
                        "Not set"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2">
                      {formatCurrency(pkg.subsidizedPackagePriceUsd)}
                    </td>
                    <td className="p-2">
                      {formatCurrency(
                        pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100,
                      )}
                    </td>
                    <td className="p-2">
                      {formatCurrency(pkg.estimatedSubsidizedRentalValueUsd)}
                    </td>
                    <td className="p-2">
                      {formatCurrency(pkg.estimatedRentalValueUsd)}
                    </td>
                    <td className="p-2">
                      <div className="max-w-[420px] break-words">
                        {pkg.items
                          .map((row) => `${row.quantity}x ${row.type?.name ?? "Unknown"}`)
                          .join(", ")}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(pkg._id);
                            packageForm.reset({
                              name: pkg.name,
                              description: pkg.description ?? "",
                              subsidizedPackagePriceUsd: pkg.subsidizedPackagePriceUsd ?? 0,
                              nonSubsidizedPackagePriceUsd:
                                pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100,
                              active: pkg.active,
                              publicListing: Boolean(pkg.publicListing),
                              publicBucket: (pkg.publicBucket ?? "") as InventoryPackageFormValues["publicBucket"],
                              publicHeroImageUrl: pkg.publicHeroImageUrl ?? "",
                              publicSlug: pkg.publicSlug ?? "",
                              items: pkg.items.map((row) => ({
                                typeId: row.typeId,
                                quantity: row.quantity,
                              })),
                            });
                            packageForm.resetSaveState();
                            setItemRows(
                              pkg.items.map((row) => ({
                                typeId: row.typeId,
                                quantity: row.quantity.toString(),
                              })),
                            );
                            setEditorOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void removePackage({ id: pkg._id })}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 pb-20">
          <div className="relative w-full max-w-4xl rounded-lg border bg-background shadow-xl">
            <div className="border-b p-4">
              <h2 className="text-lg font-semibold">{editingId ? "Edit Package" : "Create Package"}</h2>
            </div>
            <div className="max-h-[80vh] overflow-auto p-4">
              <Form {...packageForm}>
                <form
                  onSubmit={packageForm.handleSubmit(onSubmitPackage)}
                  className="space-y-3"
                >
                  <TextFormField name="name" label="Name" />
                  <TextareaFormField
                    name="description"
                    label="Description"
                    placeholder="Supports Markdown"
                  />
                  <p className="-mt-2 text-xs text-muted-foreground">
                    Multi-line; Markdown supported on the public package page.
                  </p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <TextFormField
                      name="subsidizedPackagePriceUsd"
                      label="Subsidized Package Price (USD)"
                      type="number"
                    />
                    <TextFormField
                      name="nonSubsidizedPackagePriceUsd"
                      label="Non-Subsidized Package Price (USD)"
                      type="number"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={packageForm.watch("active")}
                      onChange={(event) =>
                        packageForm.setValue("active", event.target.checked, { shouldDirty: true })
                      }
                    />
                    Active
                  </label>
                  <div className="space-y-3 rounded-md border p-3">
                    <p className="text-sm font-medium">Public listing</p>
                    <p className="text-xs text-muted-foreground">
                      Public packages appear on the unauthenticated browse pages. Line items without a full public
                      profile still show by name on the package page (for example road cases or accessories) but do
                      not get their own standalone public product page.
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={packageForm.watch("publicListing")}
                        onChange={(event) => {
                          packageForm.setValue("publicListing", event.target.checked, { shouldDirty: true });
                          if (!event.target.checked) {
                            packageForm.setValue("publicBucket", "", { shouldDirty: true });
                          }
                        }}
                      />
                      List publicly
                    </label>
                    {packageForm.watch("publicListing") ? (
                      <div className="space-y-2">
                        <Label>Public browse section</Label>
                        <select
                          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                          value={packageForm.watch("publicBucket")}
                          onChange={(event) =>
                            packageForm.setValue(
                              "publicBucket",
                              event.target.value as InventoryPackageFormValues["publicBucket"],
                              { shouldDirty: true },
                            )
                          }
                        >
                          <option value="">Select section…</option>
                          {(Object.keys(publicBucketLabels) as PublicPackageBucket[]).map((key) => (
                            <option key={key} value={key}>
                              {publicBucketLabels[key]}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Controls which tab this package appears under on the public packages page.
                        </p>
                      </div>
                    ) : null}
                    <TextFormField name="publicHeroImageUrl" label="Hero image URL" placeholder="https://..." />
                    <TextFormField
                      name="publicSlug"
                      label="Optional public slug"
                      placeholder="e.g. basic-foh-package"
                    />
                    <p className="-mt-2 text-xs text-muted-foreground">
                      Lowercase letters/numbers with dashes only.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Package Items</Label>
                    {itemRows.map((row, index) => (
                      <div
                        key={`${index}-${row.typeId}`}
                        className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_120px_auto]"
                      >
                        <SearchableSelect
                          value={row.typeId}
                          onChange={(nextValue) =>
                            setItemRows((prev) =>
                              prev.map((current, currentIndex) =>
                                currentIndex === index ? { ...current, typeId: nextValue } : current,
                              ),
                            )
                          }
                          options={(types ?? []).map((type) => ({
                            value: type._id,
                            label: `${type.name} - ${type.model}`,
                          }))}
                          placeholder="Search package item type..."
                          emptyLabel="Select type"
                        />
                        <Input
                          value={row.quantity}
                          onChange={(event) =>
                            setItemRows((prev) =>
                              prev.map((current, currentIndex) =>
                                currentIndex === index
                                  ? { ...current, quantity: event.target.value }
                                  : current,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() =>
                            setItemRows((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setItemRows((prev) => [...prev, { typeId: "", quantity: "1" }])}
                    >
                      Add Type Row
                    </Button>
                    <div className="rounded-md border p-2 text-sm">
                      <p className="mb-1 font-medium">Selected Item Pricing</p>
                      <div className="space-y-1 text-xs">
                        {itemRows
                          .filter((row) => row.typeId && Number(row.quantity) > 0)
                          .map((row, index) => {
                            const type = typeLookup.get(row.typeId);
                            if (!type) return null;
                            const qty = Number(row.quantity || "0");
                            const sub = (type.subsidizedRentalPriceUsd ?? 0) * qty;
                            const nonSub =
                              (type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0) * qty;
                            return (
                              <p key={`${row.typeId}-${index}`}>
                                {qty}x {type.name}: Sub {formatCurrency(sub)} / Non {formatCurrency(nonSub)}
                              </p>
                            );
                          })}
                      </div>
                      <div className="my-2 border-t" />
                      <p>
                        Suggested Subsidized:{" "}
                        <span className="font-medium">
                          {formatCurrency(Number(suggestedPricing.subsidized.toFixed(2)))}
                        </span>
                      </p>
                      <p>
                        Suggested Non-Subsidized:{" "}
                        <span className="font-medium">
                          {formatCurrency(Number(suggestedPricing.nonSubsidized.toFixed(2)))}
                        </span>
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            packageForm.setValue(
                              "subsidizedPackagePriceUsd",
                              Number(suggestedPricing.subsidized.toFixed(2)),
                              { shouldDirty: true },
                            );
                            packageForm.setValue(
                              "nonSubsidizedPackagePriceUsd",
                              Number(suggestedPricing.nonSubsidized.toFixed(2)),
                              { shouldDirty: true },
                            );
                          }}
                        >
                          Use Suggested Prices
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={packageForm.saveStatus === "saving"}>
                      {editingId ? "Update" : "Create"}
                    </Button>
                    <Button type="button" variant="outline" onClick={closeEditor}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </div>
          <FormSaveBar
            tier="C"
            saveStatus={packageForm.saveStatus}
            saveError={packageForm.saveError}
            isDirty={packageForm.formState.isDirty}
            saveLabel={editingId ? "Update" : "Create"}
            onSave={() => void packageForm.handleSubmit(onSubmitPackage)()}
            onDiscard={closeEditor}
            onRetry={() => void packageForm.handleSubmit(onSubmitPackage)()}
          />
        </div>
      ) : null}
    </div>
  );
}
