"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
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
import { FileUploadField } from "@/components/files/file-upload-field";
import { MultiSelectFilter } from "./multi-select-filter";
import { FilterField, FilterNativeSelect } from "./filter-controls";
import {
  PackageItemsEditor,
  useSuggestedPackagePricing,
  type PackageItemRow,
} from "./package-items-editor";
import {
  bucketForCategoryKey,
  formatTypeDisplay,
  groupRowsBySection,
  publicBucketLabels,
  sectionOrder,
  sectionFilterOptions,
  type PublicPackageBucket,
} from "./package-section-utils";
import { cn } from "@/lib/utils";
import { StoredAssetImage } from "@/components/files/stored-asset-image";

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

function packageSection(pkg: {
  publicListing?: boolean;
  publicBucket?: PublicPackageBucket;
  items: Array<{ typeId: string; type?: { category: string } | null }>;
}, categories: Array<{ key: string; publicBucket?: PublicPackageBucket | null }> | undefined): PublicPackageBucket {
  if (pkg.publicListing && pkg.publicBucket) return pkg.publicBucket;
  const counts = new Map<PublicPackageBucket, number>();
  for (const item of pkg.items) {
    if (!item.type?.category) continue;
    const bucket = bucketForCategoryKey(item.type.category, categories);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  let dominant: PublicPackageBucket = "misc";
  let max = 0;
  for (const section of sectionOrder) {
    const count = counts.get(section) ?? 0;
    if (count > max) {
      max = count;
      dominant = section;
    }
  }
  return dominant;
}

export function PackagesManager() {
  const [search, setSearch] = useState("");
  const [sectionFilterIds, setSectionFilterIds] = useState<PublicPackageBucket[]>([]);
  const [typeFilterIds, setTypeFilterIds] = useState<string[]>([]);
  const [itemFilterIds, setItemFilterIds] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"section" | "name" | "price" | "value">("section");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [itemRows, setItemRows] = useState<PackageItemRow[]>([]);

  const packages = useQuery(api.inventoryPackages.list, {});
  const types = useQuery(api.inventoryTypes.list, {});
  const inventoryItems = useQuery(api.inventoryItems.list, {});
  const categories = useQuery(api.inventoryCategories.list, { activeOnly: true });
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

  const itemFilterTypeIds = useMemo(() => {
    if (!itemFilterIds.length) return new Set<string>();
    const ids = new Set<string>();
    for (const itemId of itemFilterIds) {
      const item = (inventoryItems ?? []).find((row) => row._id === itemId);
      if (item?.typeId) ids.add(item.typeId);
    }
    return ids;
  }, [inventoryItems, itemFilterIds]);

  const typeOptions = useMemo(
    () =>
      (types ?? []).map((type) => ({
        value: type._id,
        label: formatTypeDisplay(type),
        description: publicBucketLabels[bucketForCategoryKey(type.category, categories)],
        keywords: type.category,
      })),
    [categories, types],
  );

  const inventoryItemOptions = useMemo(
    () =>
      (inventoryItems ?? []).map((item) => ({
        value: item._id,
        label: item.assetId,
        description: item.type ? formatTypeDisplay(item.type) : "Unknown type",
        keywords: item.type?.category,
      })),
    [inventoryItems],
  );

  const filteredPackages = useMemo(() => {
    const loweredSearch = search.trim().toLowerCase();
    const rows = [...(packages ?? [])].filter((pkg) => {
      if (loweredSearch && !pkg.name.toLowerCase().includes(loweredSearch)) return false;
      const section = packageSection(pkg, categories);
      if (sectionFilterIds.length && !sectionFilterIds.includes(section)) return false;
      if (typeFilterIds.length) {
        const packageTypeIds = new Set(pkg.items.map((row) => row.typeId));
        if (!typeFilterIds.some((typeId) => packageTypeIds.has(typeId as Id<"inventoryTypes">))) {
          return false;
        }
      }
      if (itemFilterTypeIds.size) {
        const packageTypeIds = new Set(pkg.items.map((row) => row.typeId));
        if (![...itemFilterTypeIds].some((typeId) => packageTypeIds.has(typeId as Id<"inventoryTypes">))) {
          return false;
        }
      }
      return true;
    });

    rows.sort((a, b) => {
      const direction = sortDir === "asc" ? 1 : -1;
      if (sortBy === "section") {
        const sectionCompare =
          sectionOrder.indexOf(packageSection(a, categories)) -
          sectionOrder.indexOf(packageSection(b, categories));
        if (sectionCompare !== 0) return sectionCompare * direction;
        return a.name.localeCompare(b.name) * direction;
      }
      if (sortBy === "price") return (a.packagePriceCents - b.packagePriceCents) * direction;
      if (sortBy === "value") {
        return ((a.estimatedRentalValueUsd ?? 0) - (b.estimatedRentalValueUsd ?? 0)) * direction;
      }
      return a.name.localeCompare(b.name) * direction;
    });
    return rows;
  }, [categories, itemFilterTypeIds, packages, search, sectionFilterIds, sortBy, sortDir, typeFilterIds]);

  const groupedPackages = useMemo(() => {
    if (sortBy !== "section") return null;
    return groupRowsBySection(
      filteredPackages.map((pkg) => ({
        pkg,
        section: packageSection(pkg, categories),
      })),
    );
  }, [categories, filteredPackages, sortBy]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (sectionFilterIds.length) count += 1;
    if (typeFilterIds.length) count += 1;
    if (itemFilterIds.length) count += 1;
    return count;
  }, [itemFilterIds.length, search, sectionFilterIds.length, typeFilterIds.length]);

  const suggestedPricing = useSuggestedPackagePricing(itemRows, typeLookup);
  const packageValues = packageForm.watch();

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    packageForm.reset(defaultPackageValues);
    packageForm.resetSaveState();
    setItemRows([]);
  }

  function requestCloseEditor() {
    if (packageForm.formState.isDirty) {
      if (!window.confirm("Discard unsaved changes?")) return;
    }
    closeEditor();
  }

  function openCreateEditor() {
    setEditingId(null);
    packageForm.reset(defaultPackageValues);
    packageForm.resetSaveState();
    setItemRows([]);
    setEditorOpen(true);
  }

  function openEditEditor(pkg: NonNullable<typeof packages>[number]) {
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
  }

  async function bulkDeleteSelected() {
    await Promise.all(selectedIds.map((id) => removePackage({ id: id as never })));
    setSelectedIds([]);
  }

  function clearFilters() {
    setSearch("");
    setSectionFilterIds([]);
    setTypeFilterIds([]);
    setItemFilterIds([]);
  }

  function renderPackageCard(pkg: NonNullable<typeof packages>[number]) {
    const section = packageSection(pkg, categories);
    const isSelected = selectedIds.includes(pkg._id);
    return (
      <Card
        key={pkg._id}
        className={cn(
          "overflow-hidden py-0 transition-shadow hover:shadow-md",
          isSelected && "ring-2 ring-primary/40",
        )}
      >
        {pkg.publicHeroImageUrl ? (
          <div className="relative h-36 w-full border-b">
            <StoredAssetImage
              storedValue={pkg.publicHeroImageUrl}
              alt=""
              className="h-full w-full object-cover"
              fallbackClassName="h-full w-full"
            />
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center border-b bg-gradient-to-br from-muted/70 to-background px-4 text-center text-xs text-muted-foreground">
            {pkg.name}
          </div>
        )}
        <CardHeader className="space-y-2 px-4 pt-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <label className="flex min-w-0 items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={isSelected}
                onChange={(event) =>
                  setSelectedIds((prev) =>
                    event.target.checked
                      ? [...prev, pkg._id]
                      : prev.filter((id) => id !== pkg._id),
                  )
                }
              />
              <span className="min-w-0">
                <CardTitle className="text-base leading-snug">{pkg.name}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {pkg.description || "No description"}
                </p>
              </span>
            </label>
            <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium">
              {publicBucketLabels[section]}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Subsidized</p>
              <p className="font-medium">{formatCurrency(pkg.subsidizedPackagePriceUsd)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Non-Subsidized</p>
              <p className="font-medium">
                {formatCurrency(pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Est. Subsidized</p>
              <p>{formatCurrency(pkg.estimatedSubsidizedRentalValueUsd)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Est. Non-Subsidized</p>
              <p>{formatCurrency(pkg.estimatedRentalValueUsd)}</p>
            </div>
          </div>
          <div className="rounded-md border bg-muted/20 p-2 text-xs">
            <p className="mb-1 font-medium">{pkg.items.length} included type{pkg.items.length === 1 ? "" : "s"}</p>
            <p className="line-clamp-3 text-muted-foreground">
              {pkg.items
                .map((row) => `${row.quantity}× ${row.type?.name ?? "Unknown"}`)
                .join(" · ")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => openEditEditor(pkg)}>
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void removePackage({ id: pkg._id })}
            >
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Packages</CardTitle>
          <div className="space-y-3">
            <FilterField label="Search" className="w-full">
              <Input
                placeholder="Search packages"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </FilterField>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MultiSelectFilter
                label="Sections"
                placeholder="Search sections…"
                values={sectionFilterIds}
                onChange={(values) => setSectionFilterIds(values as PublicPackageBucket[])}
                options={sectionFilterOptions}
                emptyLabel="All sections"
              />
              <MultiSelectFilter
                label="Types"
                placeholder="Search types…"
                values={typeFilterIds}
                onChange={setTypeFilterIds}
                options={typeOptions}
                emptyLabel="All types"
              />
              <MultiSelectFilter
                label="Inventory items"
                placeholder="Search asset IDs…"
                values={itemFilterIds}
                onChange={setItemFilterIds}
                options={inventoryItemOptions}
                emptyLabel="All items"
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <FilterNativeSelect
                label="Sort by"
                className="w-full sm:w-44"
                value={sortBy}
                onChange={(value) => setSortBy(value as typeof sortBy)}
              >
                <option value="section">Section</option>
                <option value="name">Name</option>
                <option value="price">Price</option>
                <option value="value">Est. value</option>
              </FilterNativeSelect>
              <FilterNativeSelect
                label="Order"
                className="w-full sm:w-32"
                value={sortDir}
                onChange={(value) => setSortDir(value as typeof sortDir)}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </FilterNativeSelect>
              <Button
                type="button"
                variant="outline"
                disabled={!activeFilterCount}
                onClick={clearFilters}
              >
                Clear filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
              </Button>
              <span className="pb-2 text-sm text-muted-foreground">
                {filteredPackages.length} package{filteredPackages.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={!selectedIds.length}
                onClick={() => void bulkDeleteSelected()}
              >
                Delete Selected ({selectedIds.length})
              </Button>
              <Button type="button" onClick={openCreateEditor}>
                Create Package
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!filteredPackages.length ? (
            <p className="text-sm text-muted-foreground">
              {activeFilterCount ? "No packages match the current filters." : "No packages found."}
            </p>
          ) : groupedPackages ? (
            groupedPackages.map((group) => (
              <section key={group.section} className="space-y-3">
                <h3 className="text-sm font-semibold">{publicBucketLabels[group.section]}</h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.rows.map(({ pkg }) => renderPackageCard(pkg))}
                </div>
              </section>
            ))
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredPackages.map((pkg) => renderPackageCard(pkg))}
            </div>
          )}
        </CardContent>
      </Card>

      {editorOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => requestCloseEditor()}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-lg border bg-background shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div>
                <h2 className="text-lg font-semibold">{editingId ? "Edit Package" : "Create Package"}</h2>
                <p className="text-sm text-muted-foreground">
                  Fill in package details, then add equipment from the catalog.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                aria-label="Close"
                onClick={() => requestCloseEditor()}
              >
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <Form {...packageForm}>
                <form
                  id="package-editor-form"
                  onSubmit={packageForm.handleSubmit(onSubmitPackage)}
                  className="grid gap-6 lg:grid-cols-2 lg:items-start"
                >
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Details</h3>
                    <TextFormField name="name" label="Name" />
                    <TextareaFormField
                      name="description"
                      label="Description"
                      placeholder="Supports Markdown"
                    />
                    <p className="-mt-2 text-xs text-muted-foreground">
                      Multi-line; Markdown supported on the public package page.
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
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
                        Use suggested prices
                      </Button>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={packageValues.active}
                        onChange={(event) =>
                          packageForm.setValue("active", event.target.checked, { shouldDirty: true })
                        }
                      />
                      Active
                    </label>
                    <div className="space-y-3 rounded-md border p-3">
                      <p className="text-sm font-medium">Public listing</p>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={packageValues.publicListing}
                          onChange={(event) => {
                            packageForm.setValue("publicListing", event.target.checked, { shouldDirty: true });
                            if (!event.target.checked) {
                              packageForm.setValue("publicBucket", "", { shouldDirty: true });
                            }
                          }}
                        />
                        List publicly
                      </label>
                      {packageValues.publicListing ? (
                        <div className="space-y-2">
                          <Label>Public browse section</Label>
                          <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={packageValues.publicBucket}
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
                        </div>
                      ) : null}
                      <FileUploadField
                        label="Hero image"
                        entityKind="package"
                        purpose="hero"
                        entityId={editingId ?? undefined}
                        currentUrl={packageValues.publicHeroImageUrl}
                        urlValue={packageValues.publicHeroImageUrl}
                        onUploaded={(url) =>
                          packageForm.setValue("publicHeroImageUrl", url, { shouldDirty: true })
                        }
                        onUrlChange={(url) =>
                          packageForm.setValue("publicHeroImageUrl", url, { shouldDirty: true })
                        }
                        onClear={() =>
                          packageForm.setValue("publicHeroImageUrl", "", { shouldDirty: true })
                        }
                        helperText="Upload an image or paste an https URL."
                      />
                      <TextFormField
                        name="publicSlug"
                        label="Optional public slug"
                        placeholder="e.g. basic-foh-package"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 lg:sticky lg:top-0">
                    <h3 className="text-sm font-semibold">Package contents</h3>
                    <PackageItemsEditor
                      itemRows={itemRows}
                      onItemRowsChange={setItemRows}
                      types={types ?? []}
                      inventoryItems={inventoryItems ?? []}
                      categories={categories}
                    />
                  </div>
                </form>
              </Form>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t p-4">
              <div className="min-w-0 text-sm">
                {packageForm.saveStatus === "saving" ? (
                  <span className="text-muted-foreground">Saving…</span>
                ) : packageForm.saveStatus === "error" ? (
                  <span className="text-destructive">{packageForm.saveError ?? "Save failed"}</span>
                ) : packageForm.formState.isDirty ? (
                  <span className="text-muted-foreground">Unsaved changes</span>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" onClick={() => requestCloseEditor()}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="package-editor-form"
                  disabled={packageForm.saveStatus === "saving"}
                >
                  {packageForm.saveStatus === "saving"
                    ? "Saving…"
                    : editingId
                      ? "Update"
                      : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
