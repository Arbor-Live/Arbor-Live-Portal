"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
import { api } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { type DataTableFeatures } from "@/components/ui/data-table-features";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  inventoryTypeSchema,
  type InventoryTypeFormValues,
} from "@/lib/validations/inventory";
import { formatCurrency, toCategoryOptions } from "./constants";
import { SearchableSelect } from "./searchable-select";
import { MultiSelectFilter } from "./multi-select-filter";
import { FilterField, FilterNativeSelect } from "./filter-controls";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  FileUploadField,
  InventoryResourceUploadButton,
} from "@/components/files/file-upload-field";

type InventoryTypeRow = FunctionReturnType<typeof api.inventoryTypes.list>["page"][number];

const typeColumnHelper = createColumnHelper<DataTableFeatures, InventoryTypeRow>();

type PublicVisibilityFilter = "all" | "public" | "hidden";
type PublicProfileFilter = "all" | "full" | "off";

type ResourceRow = { title: string; url: string };

function emptyResourceRow(): ResourceRow {
  return { title: "", url: "" };
}

function manualResourcesFromDb(manualUrls: { title: string; url: string }[]): ResourceRow[] {
  return manualUrls.length ? manualUrls.map((r) => ({ title: r.title, url: r.url })) : [emptyResourceRow()];
}

function gdtfResourcesFromDb(gdtf?: { title: string; url: string }[]): ResourceRow[] {
  return gdtf?.length ? gdtf.map((r) => ({ title: r.title, url: r.url })) : [emptyResourceRow()];
}

const defaultTypeValues: InventoryTypeFormValues = {
  name: "",
  description: "",
  model: "",
  manufacturer: "",
  category: "sound",
  msrpUsd: "",
  subsidizedRentalPriceUsd: "",
  nonSubsidizedRentalPriceUsd: "",
  manualResources: [emptyResourceRow()],
  lightingGdtfResources: [emptyResourceRow()],
  tips: "",
  capabilities: [],
  iconImageUrl: "",
  promoImageUrl: "",
  publicListing: false,
  publicProfile: false,
  publicSlug: "",
};

function toTypeFormValues(row: {
  name: string;
  description?: string;
  model: string;
  manufacturer?: string;
  category: string;
  msrpUsd?: number;
  subsidizedRentalPriceUsd?: number;
  nonSubsidizedRentalPriceUsd?: number;
  rentalPriceUsd?: number;
  manualUrls: { title: string; url: string }[];
  categoryMetadata?: { lighting?: { gdtfUrls?: { title: string; url: string }[] } };
  tips?: string;
  capabilities: string[];
  iconImageUrl?: string;
  promoImageUrl?: string;
  publicListing?: boolean;
  publicProfile?: boolean;
  publicSlug?: string;
}): InventoryTypeFormValues {
  return {
    name: row.name,
    description: row.description ?? "",
    model: row.model,
    manufacturer: row.manufacturer ?? "",
    category: row.category,
    msrpUsd: row.msrpUsd ?? "",
    subsidizedRentalPriceUsd: row.subsidizedRentalPriceUsd ?? "",
    nonSubsidizedRentalPriceUsd:
      row.nonSubsidizedRentalPriceUsd ?? row.rentalPriceUsd ?? "",
    manualResources: manualResourcesFromDb(row.manualUrls),
    lightingGdtfResources: gdtfResourcesFromDb(row.categoryMetadata?.lighting?.gdtfUrls),
    tips: row.tips ?? "",
    capabilities: row.capabilities,
    iconImageUrl: row.iconImageUrl ?? "",
    promoImageUrl: row.promoImageUrl ?? "",
    publicListing: Boolean(row.publicListing),
    publicProfile: Boolean(row.publicProfile),
    publicSlug: row.publicSlug ?? "",
  };
}

function buildTypePayload(
  values: InventoryTypeFormValues,
  editingRow?: { categoryMetadata?: { lighting?: Record<string, unknown> } },
) {
  const manualUrls = values.manualResources
    .filter((row) => row.url.trim())
    .map((row) => ({ title: row.title.trim() || "Manual", url: row.url.trim() }));

  const categoryMetadata =
    values.category === "lighting"
      ? {
          lighting: {
            ...(editingRow?.categoryMetadata?.lighting ?? {}),
            gdtfUrls: values.lightingGdtfResources
              .filter((row) => row.url.trim())
              .map((row) => ({ title: row.title.trim() || "GDTF", url: row.url.trim() })),
          },
        }
      : {};

  const toOptionalNumber = (value: string | number | "" | undefined) =>
    value === "" || value === undefined ? undefined : Number(value);

  return {
    name: values.name,
    description: values.description || undefined,
    model: values.model,
    manufacturer: values.manufacturer || undefined,
    category: values.category,
    msrpUsd: toOptionalNumber(values.msrpUsd),
    subsidizedRentalPriceUsd: toOptionalNumber(values.subsidizedRentalPriceUsd),
    nonSubsidizedRentalPriceUsd: toOptionalNumber(values.nonSubsidizedRentalPriceUsd),
    manualUrls,
    tips: values.tips || undefined,
    capabilities: values.capabilities.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
    iconImageUrl: values.iconImageUrl || undefined,
    promoImageUrl: values.promoImageUrl || undefined,
    publicListing: values.publicListing,
    publicProfile: values.publicProfile,
    publicSlug: values.publicSlug?.trim() || undefined,
    categoryMetadata,
  };
}

function formatVisibilityLabel(row: { publicListing?: boolean; publicProfile?: boolean }) {
  if (!row.publicListing) return "Hidden";
  if (row.publicProfile) return "Public + profile";
  return "Public listing";
}

function formatTypeDisplay(type: {
  manufacturer?: string;
  name: string;
  model: string;
}) {
  const maker = type.manufacturer?.trim();
  const sameNameModel = type.name.trim().toLowerCase() === type.model.trim().toLowerCase();
  const core = sameNameModel ? type.name : `${type.name} / ${type.model}`;
  return maker ? `${maker} ${core}` : core;
}

function visibilityBadgeClass(row: { publicListing?: boolean; publicProfile?: boolean }) {
  if (!row.publicListing) return "border-muted-foreground/30 text-muted-foreground";
  if (row.publicProfile) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

export function TypesManager() {
  const { alert } = useAppDialog();
  const [search, setSearch] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [publicVisibility, setPublicVisibility] = useState<PublicVisibilityFilter>("all");
  const [publicProfileFilter, setPublicProfileFilter] = useState<PublicProfileFilter>("all");
  const [selectedCapability, setSelectedCapability] = useState("");
  const [selectedManufacturer, setSelectedManufacturer] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkActionPending, setBulkActionPending] = useState(false);
  const [capabilityForm, setCapabilityForm] = useState({ key: "", label: "", category: "" });
  const [categoryForm, setCategoryForm] = useState({ key: "", label: "", publicBucket: "" });
  const [capabilityPickerOpen, setCapabilityPickerOpen] = useState(false);
  const [capabilityQuery, setCapabilityQuery] = useState("");

  const typeForm = useConvexForm<InventoryTypeFormValues>({
    schema: inventoryTypeSchema,
    defaultValues: defaultTypeValues,
    mode: editingId ? "onChange" : "onTouched",
  });

  const categories = useQuery(api.inventoryCategories.list, { activeOnly: false });
  const manufacturerOptions = useQuery(api.inventoryTypes.listManufacturers, {}) ?? [];
  const {
    results: types,
    status: typesStatus,
    loadMore,
  } = usePaginatedQuery(
    api.inventoryTypes.list,
    {
      search: search.trim() || undefined,
      category: selectedCategoryIds.length === 1 ? selectedCategoryIds[0] : undefined,
      capability: selectedCapability || undefined,
      manufacturer: selectedManufacturer || undefined,
      publicListing:
        publicVisibility === "all" ? undefined : publicVisibility === "public",
      publicProfile:
        publicProfileFilter === "all" ? undefined : publicProfileFilter === "full",
    },
    { initialNumItems: 100 },
  );
  const capabilities = useQuery(api.capabilityDefinitions.list, { activeOnly: false });

  const ensureDefaults = useMutation(api.inventoryCategories.ensureDefaults);
  const createCategory = useMutation(api.inventoryCategories.create);
  const updateCategory = useMutation(api.inventoryCategories.update);
  const removeCategory = useMutation(api.inventoryCategories.remove);
  const createType = useMutation(api.inventoryTypes.create);
  const updateType = useMutation(api.inventoryTypes.update);
  const deleteType = useMutation(api.inventoryTypes.remove);
  const bulkUpdateVisibility = useMutation(api.inventoryTypes.bulkUpdateVisibility);
  const createCapability = useMutation(api.capabilityDefinitions.create);
  const deleteCapability = useMutation(api.capabilityDefinitions.remove);

  useEffect(() => {
    if (categories === undefined) return;
    if (categories.length > 0) return;
    void ensureDefaults({}).catch(() => {
      // Admin-only seed; type create also seeds server-side when needed.
    });
  }, [categories, ensureDefaults]);

  const rows = useMemo(() => {
    const base = types;
    if (selectedCategoryIds.length <= 1) return base;
    return base.filter((row) => selectedCategoryIds.includes(row.category));
  }, [selectedCategoryIds, types]);
  const capabilityOptions = useMemo(() => capabilities ?? [], [capabilities]);
  const categoryOptions = useMemo(() => toCategoryOptions(categories), [categories]);
  const categoryFilterOptions = useMemo(
    () =>
      categoryOptions.map((category) => ({
        value: category.value,
        label: category.label,
      })),
    [categoryOptions],
  );
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (selectedCategoryIds.length) count += 1;
    if (publicVisibility !== "all") count += 1;
    if (publicProfileFilter !== "all") count += 1;
    if (selectedCapability) count += 1;
    if (selectedManufacturer) count += 1;
    return count;
  }, [
    publicProfileFilter,
    publicVisibility,
    search,
    selectedCapability,
    selectedCategoryIds,
    selectedManufacturer,
  ]);
  const filteredCapabilityOptions = useMemo(() => {
    const query = capabilityQuery.trim().toLowerCase();
    if (!query) return capabilityOptions;
    return capabilityOptions.filter(
      (option) =>
        option.key.toLowerCase().includes(query) || option.label.toLowerCase().includes(query),
    );
  }, [capabilityOptions, capabilityQuery]);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );

  async function handleCreateCategory() {
    if (!categoryForm.key.trim() || !categoryForm.label.trim()) return;
    await createCategory({
      key: categoryForm.key,
      label: categoryForm.label,
      publicBucket: categoryForm.publicBucket
        ? (categoryForm.publicBucket as "lighting" | "sound" | "environmental" | "staging" | "misc")
        : undefined,
      active: true,
    });
    setCategoryForm({ key: "", label: "", publicBucket: "" });
  }

  const editingRow = editingId ? rows.find((r) => r._id === editingId) : undefined;

  const persistType = async (values: InventoryTypeFormValues) => {
    const payload = buildTypePayload(values, editingRow);
    if (editingId) {
      await updateType({ id: editingId as never, ...payload });
    } else {
      await createType(payload);
      typeForm.reset(defaultTypeValues);
      typeForm.resetSaveState();
    }
  };

  const onSubmitType = typeForm.submitMutation(persistType);

  function beginEdit(row: (typeof rows)[number]) {
    setEditingId(row._id);
    const values = toTypeFormValues(row);
    typeForm.reset(values);
    typeForm.resetSaveState();
  }

  const typeColumns = typeColumnHelper.columns([
    typeColumnHelper.display({
      id: "select",
      enableHiding: false,
      enableSorting: false,
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          ref={(element) => {
            if (element) element.indeterminate = table.getIsSomeRowsSelected();
          }}
          onChange={(event) => table.toggleAllRowsSelected(event.target.checked)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={(event) => row.toggleSelected(event.target.checked)}
          aria-label="Select row"
        />
      ),
    }),
    typeColumnHelper.accessor((row) => formatTypeDisplay(row), {
      id: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <div data-testid={`type-row-${row.original._id}`}>
          <div className="font-medium">{formatTypeDisplay(row.original)}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.capabilities.join(", ") || "no capabilities"}
          </div>
        </div>
      ),
    }),
    typeColumnHelper.accessor("category", {
      id: "category",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
    }),
    typeColumnHelper.accessor(
      (row) => {
        if (!row.publicListing) return 0;
        if (row.publicProfile) return 2;
        return 1;
      },
      {
        id: "visibility",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Visibility" />,
        cell: ({ row }) => (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${visibilityBadgeClass(row.original)}`}
          >
            {formatVisibilityLabel(row.original)}
          </span>
        ),
        sortFn: "basic",
      },
    ),
    typeColumnHelper.accessor((row) => row.msrpUsd ?? 0, {
      id: "msrp",
      header: ({ column }) => <DataTableColumnHeader column={column} title="MSRP" />,
      cell: ({ row }) => formatCurrency(row.original.msrpUsd),
      sortFn: "basic",
    }),
    typeColumnHelper.accessor((row) => row.subsidizedRentalPriceUsd ?? 0, {
      id: "subsidized",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subsidized" />,
      cell: ({ row }) => formatCurrency(row.original.subsidizedRentalPriceUsd),
      sortFn: "basic",
    }),
    typeColumnHelper.accessor(
      (row) => row.nonSubsidizedRentalPriceUsd ?? row.rentalPriceUsd ?? 0,
      {
        id: "normal",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Normal" />,
        cell: ({ row }) =>
          formatCurrency(row.original.nonSubsidizedRentalPriceUsd ?? row.original.rentalPriceUsd),
        sortFn: "basic",
      },
    ),
    typeColumnHelper.display({
      id: "actions",
      enableHiding: false,
      enableSorting: false,
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => beginEdit(row.original)}>
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => void deleteType({ id: row.original._id })}
          >
            Delete
          </Button>
        </div>
      ),
    }),
  ]);

  function cancelEdit() {
    setEditingId(null);
    typeForm.reset(defaultTypeValues);
    typeForm.resetSaveState();
  }

  async function bulkDeleteSelected() {
    try {
      await Promise.all(selectedIds.map((id) => deleteType({ id: id as never })));
      setRowSelection({});
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Could not delete selected types."));
    }
  }

  async function bulkSetVisibility(options: {
    publicListing?: boolean;
    publicProfile?: boolean;
  }) {
    if (!selectedIds.length) return;
    setBulkActionPending(true);
    try {
      await bulkUpdateVisibility({
        ids: selectedIds as never,
        ...options,
      });
      setRowSelection({});
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Could not update visibility for selected types."));
    } finally {
      setBulkActionPending(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setSelectedCategoryIds([]);
    setPublicVisibility("all");
    setPublicProfileFilter("all");
    setSelectedCapability("");
    setSelectedManufacturer("");
  }

  const typeValues = typeForm.watch();
  const setTypeField = <K extends keyof InventoryTypeFormValues>(
    key: K,
    value: InventoryTypeFormValues[K],
  ) => {
    typeForm.setValue(key, value as never, { shouldDirty: true });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Model Types</CardTitle>
          <div className="space-y-3">
            <FilterField label="Search" className="w-full">
              <Input
                placeholder="Search name, model, manufacturer, description, capabilities, slug…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </FilterField>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MultiSelectFilter
                label="Categories"
                placeholder="Search categories…"
                values={selectedCategoryIds}
                onChange={setSelectedCategoryIds}
                options={categoryFilterOptions}
                emptyLabel="All categories"
              />
              <FilterNativeSelect
                label="Visibility"
                value={publicVisibility}
                onChange={(value) => setPublicVisibility(value as PublicVisibilityFilter)}
              >
                <option value="all">All visibility</option>
                <option value="public">Listed publicly</option>
                <option value="hidden">Hidden from public</option>
              </FilterNativeSelect>
              <FilterNativeSelect
                label="Profile mode"
                value={publicProfileFilter}
                onChange={(value) => setPublicProfileFilter(value as PublicProfileFilter)}
              >
                <option value="all">All profile modes</option>
                <option value="full">Full public profile</option>
                <option value="off">Listing only / profile off</option>
              </FilterNativeSelect>
              <FilterField label="Capability">
                <SearchableSelect
                  value={selectedCapability}
                  onChange={setSelectedCapability}
                  options={[
                    { value: "", label: "All capabilities" },
                    ...capabilityOptions.map((capability) => ({
                      value: capability.key,
                      label: capability.label,
                    })),
                  ]}
                  placeholder="Filter by capability…"
                  emptyLabel="All capabilities"
                />
              </FilterField>
              <FilterField label="Manufacturer">
                <SearchableSelect
                  value={selectedManufacturer}
                  onChange={setSelectedManufacturer}
                  options={[
                    { value: "", label: "All manufacturers" },
                    ...manufacturerOptions.map((manufacturer) => ({
                      value: manufacturer,
                      label: manufacturer,
                    })),
                  ]}
                  placeholder="Filter by manufacturer…"
                  emptyLabel="All manufacturers"
                />
              </FilterField>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={!activeFilterCount}
                onClick={clearFilters}
              >
                Clear filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
              </Button>
              <span className="pb-2 text-sm text-muted-foreground">
                {rows.length} type{rows.length === 1 ? "" : "s"}
                {selectedIds.length ? ` · ${selectedIds.length} selected` : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 rounded-md border bg-muted/30 p-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedIds.length || bulkActionPending}
                onClick={() => void bulkSetVisibility({ publicListing: true })}
              >
                List publicly
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedIds.length || bulkActionPending}
                onClick={() => void bulkSetVisibility({ publicListing: false, publicProfile: false })}
              >
                Hide from public
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedIds.length || bulkActionPending}
                onClick={() => void bulkSetVisibility({ publicProfile: true })}
              >
                Enable full profile
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedIds.length || bulkActionPending}
                onClick={() => void bulkSetVisibility({ publicProfile: false })}
              >
                Disable full profile
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!selectedIds.length || bulkActionPending}
                onClick={() => void bulkDeleteSelected()}
              >
                Delete selected ({selectedIds.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <DataTable
            columns={typeColumns}
            data={rows}
            getRowId={(row) => row._id}
            enableRowSelection
            enableColumnVisibility
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            initialSorting={[{ id: "name", desc: false }]}
            emptyMessage={
              activeFilterCount ? "No types match the current filters." : "No types found."
            }
          />
          {typesStatus === "CanLoadMore" || typesStatus === "LoadingMore" ? (
            <Button
              type="button"
              variant="outline"
              disabled={typesStatus === "LoadingMore"}
              onClick={() => loadMore(100)}
            >
              {typesStatus === "LoadingMore" ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className={editingId ? "pb-20" : undefined}>
          <CardHeader>
            <CardTitle>{editingId ? "Edit Type" : "Create Type"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Form {...typeForm}>
              <form onSubmit={typeForm.handleSubmit(onSubmitType)} className="space-y-3">
                <TextFormField name="name" label="Name" />
                <TextFormField name="model" label="Model" />
                <TextFormField name="manufacturer" label="Manufacturer" />
                <div className="space-y-2" data-testid="type-category-field">
                  <Label>Category</Label>
                  <SearchableSelect
                    value={typeValues.category}
                    onChange={(nextValue) => setTypeField("category", nextValue)}
                    options={categoryOptions.map((category) => ({
                      value: category.value,
                      label: category.label,
                    }))}
                    placeholder="Search categories..."
                    emptyLabel="Select category"
                  />
                </div>
                <TextareaFormField
                  name="description"
                  label="Description"
                  placeholder="Supports Markdown (headings, lists, links, …)"
                />
                <p className="-mt-2 text-xs text-muted-foreground">
                  Shown on public model listings when this type is publicly listed. Multi-line; Markdown supported.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <TextFormField name="msrpUsd" label="MSRP (USD)" type="number" />
                  <TextFormField name="subsidizedRentalPriceUsd" label="Subsidized (5%) USD" type="number" />
                  <TextFormField name="nonSubsidizedRentalPriceUsd" label="Normal (10%) USD" type="number" />
                </div>
                <div className="space-y-2">
                  <Label>Capabilities</Label>
                  <div className="relative">
                    <button
                      type="button"
                      data-testid="type-capability-picker"
                      className="h-9 w-full rounded-md border bg-background px-3 text-left text-sm"
                      onClick={() => setCapabilityPickerOpen((prev) => !prev)}
                    >
                      {typeValues.capabilities.length
                        ? `${typeValues.capabilities.length} selected`
                        : "Select capabilities"}
                    </button>
                    {capabilityPickerOpen ? (
                      <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover p-2 shadow-md">
                        <Input
                          placeholder="Search capabilities..."
                          value={capabilityQuery}
                          onChange={(event) => setCapabilityQuery(event.target.value)}
                        />
                        <div className="mt-2 max-h-44 space-y-1 overflow-auto">
                          {filteredCapabilityOptions.map((option) => (
                            <label
                              key={option._id}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                            >
                              <input
                                type="checkbox"
                                checked={typeValues.capabilities.includes(option.key)}
                                onChange={(event) =>
                                  setTypeField(
                                    "capabilities",
                                    event.target.checked
                                      ? [...typeValues.capabilities, option.key]
                                      : typeValues.capabilities.filter((entry) => entry !== option.key),
                                  )
                                }
                              />
                              <span>{option.label}</span>
                              <span className="text-xs text-muted-foreground">({option.key})</span>
                            </label>
                          ))}
                          {!filteredCapabilityOptions.length ? (
                            <p className="px-2 py-1 text-xs text-muted-foreground">No capabilities found.</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {typeValues.capabilities.length ? (
                    <div className="flex flex-wrap gap-1">
                      {typeValues.capabilities.map((capability) => (
                        <button
                          key={capability}
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
                          onClick={() =>
                            setTypeField(
                              "capabilities",
                              typeValues.capabilities.filter((entry) => entry !== capability),
                            )
                          }
                        >
                          {capability} x
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Resources — manuals &amp; documentation</Label>
                  <p className="text-xs text-muted-foreground">
                    A title and URL for each link (e.g. Manual, DMX reference).
                  </p>
                  {typeValues.manualResources.map((resourceRow, index) => (
                    <div key={`manual-${index}`} className="flex flex-wrap items-center gap-2">
                      <Input
                        placeholder="Title"
                        className="w-full max-w-[220px]"
                        value={resourceRow.title}
                        onChange={(event) =>
                          setTypeField(
                            "manualResources",
                            typeValues.manualResources.map((current, currentIndex) =>
                              currentIndex === index
                                ? { ...current, title: event.target.value }
                                : current,
                            ),
                          )
                        }
                      />
                      <Input
                        placeholder="https://…"
                        className="min-w-0 flex-1"
                        value={resourceRow.url}
                        onChange={(event) =>
                          setTypeField(
                            "manualResources",
                            typeValues.manualResources.map((current, currentIndex) =>
                              currentIndex === index
                                ? { ...current, url: event.target.value }
                                : current,
                            ),
                          )
                        }
                      />
                      <InventoryResourceUploadButton
                        entityKind="type"
                        purpose="manual"
                        entityId={editingId ?? undefined}
                        onUploaded={({ url, title }) =>
                          setTypeField(
                            "manualResources",
                            typeValues.manualResources.map((current, currentIndex) =>
                              currentIndex === index
                                ? {
                                    title: current.title.trim() || title,
                                    url,
                                  }
                                : current,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setTypeField(
                            "manualResources",
                            typeValues.manualResources.filter((_, i) => i !== index),
                          )
                        }
                        disabled={typeValues.manualResources.length <= 1}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setTypeField("manualResources", [
                        ...typeValues.manualResources,
                        emptyResourceRow(),
                      ])
                    }
                  >
                    Add link
                  </Button>
                </div>
                {typeValues.category === "lighting" ? (
                  <div className="space-y-2">
                    <Label>Resources — GDTF &amp; fixture links</Label>
                    <p className="text-xs text-muted-foreground">
                      Title and URL for each GDTF or fixture library link.
                    </p>
                    {typeValues.lightingGdtfResources.map((resourceRow, index) => (
                      <div key={`gdtf-${index}`} className="flex flex-wrap items-center gap-2">
                        <Input
                          placeholder="Title"
                          className="w-full max-w-[220px]"
                          value={resourceRow.title}
                          onChange={(event) =>
                            setTypeField(
                              "lightingGdtfResources",
                              typeValues.lightingGdtfResources.map((current, currentIndex) =>
                                currentIndex === index
                                  ? { ...current, title: event.target.value }
                                  : current,
                              ),
                            )
                          }
                        />
                        <Input
                          placeholder="https://…"
                          className="min-w-0 flex-1"
                          value={resourceRow.url}
                          onChange={(event) =>
                            setTypeField(
                              "lightingGdtfResources",
                              typeValues.lightingGdtfResources.map((current, currentIndex) =>
                                currentIndex === index
                                  ? { ...current, url: event.target.value }
                                  : current,
                              ),
                            )
                          }
                        />
                        <InventoryResourceUploadButton
                          entityKind="type"
                          purpose="gdtf"
                          entityId={editingId ?? undefined}
                          onUploaded={({ url, title }) =>
                            setTypeField(
                              "lightingGdtfResources",
                              typeValues.lightingGdtfResources.map((current, currentIndex) =>
                                currentIndex === index
                                  ? {
                                      title: current.title.trim() || title,
                                      url,
                                    }
                                  : current,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setTypeField(
                              "lightingGdtfResources",
                              typeValues.lightingGdtfResources.filter((_, i) => i !== index),
                            )
                          }
                          disabled={typeValues.lightingGdtfResources.length <= 1}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setTypeField("lightingGdtfResources", [
                          ...typeValues.lightingGdtfResources,
                          emptyResourceRow(),
                        ])
                      }
                    >
                      Add link
                    </Button>
                  </div>
                ) : null}
                <TextareaFormField name="tips" label="Tips" placeholder="Supports Markdown" />
                <p className="-mt-2 text-xs text-muted-foreground">
                  Shown when full public profile is enabled. Multi-line; Markdown supported.
                </p>
                <FileUploadField
                  label="Icon image"
                  entityKind="type"
                  purpose="icon"
                  entityId={editingId ?? undefined}
                  currentUrl={typeValues.iconImageUrl}
                  urlValue={typeValues.iconImageUrl}
                  onUploaded={(url) => setTypeField("iconImageUrl", url)}
                  onUrlChange={(url) => setTypeField("iconImageUrl", url)}
                  onClear={() => setTypeField("iconImageUrl", "")}
                  helperText="Small icon shown on public equipment pages."
                />
                <FileUploadField
                  label="Promo image"
                  entityKind="type"
                  purpose="promo"
                  entityId={editingId ?? undefined}
                  currentUrl={typeValues.promoImageUrl}
                  urlValue={typeValues.promoImageUrl}
                  onUploaded={(url) => setTypeField("promoImageUrl", url)}
                  onUrlChange={(url) => setTypeField("promoImageUrl", url)}
                  onClear={() => setTypeField("promoImageUrl", "")}
                  helperText="Larger marketing image for public type profiles."
                />
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm font-medium">Public sharing</p>
                  <p className="text-xs text-muted-foreground">
                    Public listings appear on the unauthenticated browse pages, grouped by each category&apos;s public
                    bucket. Full public profiles unlock manuals/GDTF/images on public pages (including Lost &amp; Found
                    when enabled on the item).
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={typeValues.publicListing}
                      onChange={(event) => setTypeField("publicListing", event.target.checked)}
                    />
                    List publicly
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={typeValues.publicProfile}
                      onChange={(event) => setTypeField("publicProfile", event.target.checked)}
                    />
                    Share full public profile (manuals, images, GDTF metadata)
                  </label>
                  <TextFormField
                    name="publicSlug"
                    label="Optional public slug (for direct links)"
                    placeholder="e.g. clay-paky-mythos2"
                  />
                  <p className="-mt-2 text-xs text-muted-foreground">
                    Lowercase letters/numbers with dashes only.
                  </p>
                </div>
                <div className="flex gap-2">
                  {!editingId ? (
                    <Button type="submit" disabled={typeForm.saveStatus === "saving"}>
                      Create
                    </Button>
                  ) : null}
                  {editingId ? (
                    <Button type="button" variant="outline" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <FormSaveBar
          tier="C"
          saveStatus={typeForm.saveStatus}
          saveError={typeForm.saveError}
          isDirty={typeForm.formState.isDirty}
          saveLabel={editingId ? "Save" : "Create"}
          onSave={() => void typeForm.handleSubmit(onSubmitType)()}
          onDiscard={() => {
            if (editingId && editingRow) {
              typeForm.reset(toTypeFormValues(editingRow));
            } else {
              typeForm.reset(defaultTypeValues);
            }
            typeForm.resetSaveState();
          }}
          onRetry={() => void typeForm.handleSubmit(onSubmitType)()}
        />

        <Card>
          <CardHeader>
            <CardTitle>Add Capability Key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="key (e.g. wireless)"
              value={capabilityForm.key}
              onChange={(event) =>
                setCapabilityForm((prev) => ({ ...prev, key: event.target.value }))
              }
            />
            <Input
              placeholder="Label"
              value={capabilityForm.label}
              onChange={(event) =>
                setCapabilityForm((prev) => ({ ...prev, label: event.target.value }))
              }
            />
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={capabilityForm.category}
              onChange={(event) =>
                setCapabilityForm((prev) => ({ ...prev, category: event.target.value }))
              }
            >
              <option value="">All Categories</option>
              {categoryOptions.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              onClick={() =>
                void createCapability({
                  key: capabilityForm.key,
                  label: capabilityForm.label,
                  category:
                    capabilityForm.category || undefined,
                  active: true,
                }).then(() => setCapabilityForm({ key: "", label: "", category: "" }))
              }
            >
              Add Capability
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manage Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button type="button" variant="outline" onClick={() => void ensureDefaults({})}>
              Seed Default Categories
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="key (e.g. backline)"
                value={categoryForm.key}
                onChange={(event) =>
                  setCategoryForm((prev) => ({ ...prev, key: event.target.value }))
                }
              />
              <Input
                placeholder="Label"
                value={categoryForm.label}
                onChange={(event) =>
                  setCategoryForm((prev) => ({ ...prev, label: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Public bucket (for browse grouping)</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={categoryForm.publicBucket}
                onChange={(event) =>
                  setCategoryForm((prev) => ({ ...prev, publicBucket: event.target.value }))
                }
              >
                <option value="">Auto / unset</option>
                <option value="lighting">Lighting</option>
                <option value="sound">Sound</option>
                <option value="environmental">Environmental</option>
                <option value="staging">Staging</option>
                <option value="misc">Misc</option>
              </select>
            </div>
            <Button type="button" onClick={() => void handleCreateCategory()}>
              Add Category
            </Button>
            <div className="space-y-2">
              {(categories ?? []).map((category) => (
                <div
                  key={category._id}
                  data-testid={`category-row-${category.key}`}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div>
                    <p className="text-sm font-medium">{category.label}</p>
                    <p className="text-xs text-muted-foreground">{category.key}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Bucket</span>
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        value={category.publicBucket ?? ""}
                        onChange={(event) =>
                          void updateCategory({
                            id: category._id,
                            publicBucket: event.target.value
                              ? (event.target.value as
                                  | "lighting"
                                  | "sound"
                                  | "environmental"
                                  | "staging"
                                  | "misc")
                              : null,
                          })
                        }
                      >
                        <option value="">Auto</option>
                        <option value="lighting">Lighting</option>
                        <option value="sound">Sound</option>
                        <option value="environmental">Environmental</option>
                        <option value="staging">Staging</option>
                        <option value="misc">Misc</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void updateCategory({
                          id: category._id,
                          active: !category.active,
                        })
                      }
                    >
                      {category.active ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void removeCategory({ id: category._id })}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Existing Capabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {capabilityOptions.map((capability) => (
              <div
                key={capability._id}
                data-testid={`capability-row-${capability.key}`}
                className="flex items-center justify-between rounded-md border p-2"
              >
                <div>
                  <p className="text-sm font-medium">{capability.label}</p>
                  <p className="text-xs text-muted-foreground">{capability.key}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => void deleteCapability({ id: capability._id })}
                >
                  Delete
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
