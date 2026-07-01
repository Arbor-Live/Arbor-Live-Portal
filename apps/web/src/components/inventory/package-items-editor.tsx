"use client";

/* eslint-disable @next/next/no-img-element -- inventory admin may reference uploaded asset URLs */

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownContent } from "@/components/markdown-content";
import { MultiSelectFilter } from "./multi-select-filter";
import { formatCurrency } from "./constants";
import {
  bucketForCategoryKey,
  formatTypeDisplay,
  groupRowsBySection,
  publicBucketLabels,
  type PublicPackageBucket,
} from "./package-section-utils";
import { cn } from "@/lib/utils";

export type PackageItemRow = { typeId: string; quantity: string };

type InventoryTypeRow = {
  _id: string;
  name: string;
  model: string;
  manufacturer?: string;
  category: string;
  description?: string;
  subsidizedRentalPriceUsd?: number;
  nonSubsidizedRentalPriceUsd?: number;
  rentalPriceUsd?: number;
  iconImageUrl?: string;
  promoImageUrl?: string;
};

type InventoryItemRow = {
  _id: string;
  assetId: string;
  typeId: string;
  type?: { name: string; model: string; manufacturer?: string; category: string } | null;
};

type CategoryRow = {
  key: string;
  publicBucket?: PublicPackageBucket | null;
};

function parseQuantity(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export function PackageItemsEditor({
  itemRows,
  onItemRowsChange,
  types,
  inventoryItems,
  categories,
  packageName,
  packageDescription,
  heroImageUrl,
}: {
  itemRows: PackageItemRow[];
  onItemRowsChange: (rows: PackageItemRow[]) => void;
  types: InventoryTypeRow[];
  inventoryItems: InventoryItemRow[];
  categories: CategoryRow[] | undefined;
  packageName: string;
  packageDescription: string;
  heroImageUrl: string;
}) {
  const [catalogSearch, setCatalogSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState<"" | PublicPackageBucket>("");
  const [typeFilterIds, setTypeFilterIds] = useState<string[]>([]);
  const [itemFilterIds, setItemFilterIds] = useState<string[]>([]);

  const typeLookup = useMemo(() => new Map(types.map((type) => [type._id, type])), [types]);

  const selectedItems = useMemo(() => {
    return itemRows
      .filter((row) => row.typeId && parseQuantity(row.quantity) > 0)
      .map((row, index) => {
        const type = typeLookup.get(row.typeId);
        const section = type ? bucketForCategoryKey(type.category, categories) : "misc";
        return {
          index,
          row,
          type,
          section,
          quantity: parseQuantity(row.quantity),
        };
      })
      .filter((entry) => entry.type);
  }, [categories, itemRows, typeLookup]);

  const selectedSections = useMemo(
    () => groupRowsBySection(selectedItems),
    [selectedItems],
  );

  const typeFilterTypeIds = useMemo(() => {
    if (!itemFilterIds.length) return new Set<string>();
    const ids = new Set<string>();
    for (const itemId of itemFilterIds) {
      const item = inventoryItems.find((row) => row._id === itemId);
      if (item?.typeId) ids.add(item.typeId);
    }
    return ids;
  }, [inventoryItems, itemFilterIds]);

  const catalogTypes = useMemo(() => {
    const lowered = catalogSearch.trim().toLowerCase();
    return types.filter((type) => {
      const section = bucketForCategoryKey(type.category, categories);
      if (sectionFilter && section !== sectionFilter) return false;
      if (typeFilterIds.length && !typeFilterIds.includes(type._id)) return false;
      if (typeFilterTypeIds.size && !typeFilterTypeIds.has(type._id)) return false;
      if (!lowered) return true;
      const haystack = `${formatTypeDisplay(type)} ${type.category} ${type.description ?? ""}`.toLowerCase();
      return haystack.includes(lowered);
    });
  }, [catalogSearch, categories, sectionFilter, typeFilterIds, typeFilterTypeIds, types]);

  const catalogSections = useMemo(
    () =>
      groupRowsBySection(
        catalogTypes.map((type) => ({
          type,
          section: bucketForCategoryKey(type.category, categories),
        })),
      ),
    [catalogTypes, categories],
  );

  const typeOptions = useMemo(
    () =>
      types.map((type) => ({
        value: type._id,
        label: formatTypeDisplay(type),
        description: publicBucketLabels[bucketForCategoryKey(type.category, categories)],
        keywords: type.category,
      })),
    [categories, types],
  );

  const inventoryItemOptions = useMemo(
    () =>
      inventoryItems.map((item) => ({
        value: item._id,
        label: item.assetId,
        description: item.type ? formatTypeDisplay(item.type) : "Unknown type",
        keywords: item.type?.category,
      })),
    [inventoryItems],
  );

  function updateQuantity(typeId: string, nextQuantity: number) {
    onItemRowsChange(
      itemRows.map((row) =>
        row.typeId === typeId ? { ...row, quantity: String(Math.max(1, nextQuantity)) } : row,
      ),
    );
  }

  function removeType(typeId: string) {
    onItemRowsChange(itemRows.filter((row) => row.typeId !== typeId));
  }

  function addType(typeId: string) {
    const existing = itemRows.find((row) => row.typeId === typeId);
    if (existing) {
      updateQuantity(typeId, parseQuantity(existing.quantity) + 1);
      return;
    }
    onItemRowsChange([...itemRows.filter((row) => row.typeId), { typeId, quantity: "1" }]);
  }

  const suggestedPricing = useMemo(() => {
    return selectedItems.reduce(
      (acc, entry) => {
        const type = entry.type!;
        acc.subsidized += (type.subsidizedRentalPriceUsd ?? 0) * entry.quantity;
        acc.nonSubsidized +=
          (type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0) * entry.quantity;
        return acc;
      },
      { subsidized: 0, nonSubsidized: 0 },
    );
  }, [selectedItems]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border bg-muted/20">
        {heroImageUrl ? (
          <div className="relative aspect-[21/9] min-h-[12rem] w-full">
            <img src={heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h3 className="text-xl font-semibold">{packageName.trim() || "Package name"}</h3>
            </div>
          </div>
        ) : (
          <div className="border-b bg-gradient-to-br from-muted/60 to-background px-4 py-6">
            <h3 className="text-xl font-semibold">{packageName.trim() || "Package name"}</h3>
          </div>
        )}
        <div className="space-y-4 p-4">
          {packageDescription.trim() ? (
            <div className="text-muted-foreground">
              <MarkdownContent>{packageDescription}</MarkdownContent>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Add a description to preview it here.</p>
          )}

          <div className="space-y-5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-base">What&apos;s included</Label>
              <span className="text-xs text-muted-foreground">
                {selectedItems.length} line{selectedItems.length === 1 ? "" : "s"}
              </span>
            </div>

            {!selectedItems.length ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                Add equipment from the catalog below. Items appear here grouped by section, similar to the public
                package page.
              </div>
            ) : (
              selectedSections.map((group) => (
                <section key={group.section} className="space-y-3">
                  <h4 className="text-sm font-semibold">{publicBucketLabels[group.section]}</h4>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {group.rows.map((entry) => {
                      const type = entry.type!;
                      const imageUrl = type.promoImageUrl || type.iconImageUrl;
                      return (
                        <Card key={entry.row.typeId} className="overflow-hidden py-0 shadow-sm">
                          {imageUrl ? (
                            <div className="relative h-28 w-full border-b bg-muted/30">
                              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className="flex h-28 items-center justify-center border-b bg-muted/40 px-3 text-center text-xs text-muted-foreground">
                              {formatTypeDisplay(type)}
                            </div>
                          )}
                          <CardHeader className="space-y-1 px-4 pt-4 pb-2">
                            <CardTitle className="text-sm leading-snug">
                              {entry.quantity}× {type.name}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">{formatTypeDisplay(type)}</p>
                          </CardHeader>
                          <CardContent className="flex items-center justify-between gap-2 px-4 pb-4">
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 px-0"
                                onClick={() => updateQuantity(entry.row.typeId, entry.quantity - 1)}
                              >
                                −
                              </Button>
                              <Input
                                className="h-8 w-14 px-2 text-center"
                                value={entry.row.quantity}
                                onChange={(event) => {
                                  const next = event.target.value.replace(/[^\d]/g, "");
                                  onItemRowsChange(
                                    itemRows.map((row) =>
                                      row.typeId === entry.row.typeId
                                        ? { ...row, quantity: next || "1" }
                                        : row,
                                    ),
                                  );
                                }}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 px-0"
                                onClick={() => updateQuantity(entry.row.typeId, entry.quantity + 1)}
                              >
                                +
                              </Button>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => removeType(entry.row.typeId)}
                            >
                              Remove
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Add equipment</p>
            <p className="text-xs text-muted-foreground">
              Browse by section, filter by types or inventory items, then click to add.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!itemRows.length}
            onClick={() => onItemRowsChange([])}
          >
            Clear all items
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            placeholder="Search catalog…"
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
          />
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Section</p>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={sectionFilter}
              onChange={(event) => setSectionFilter(event.target.value as "" | PublicPackageBucket)}
            >
              <option value="">All sections</option>
              {(Object.keys(publicBucketLabels) as PublicPackageBucket[]).map((key) => (
                <option key={key} value={key}>
                  {publicBucketLabels[key]}
                </option>
              ))}
            </select>
          </div>
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

        {!catalogTypes.length ? (
          <p className="text-sm text-muted-foreground">No catalog types match the current filters.</p>
        ) : (
          <div className="max-h-[28rem] space-y-4 overflow-auto pr-1">
            {catalogSections.map((group) => (
              <section key={group.section} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {publicBucketLabels[group.section]}
                </h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.rows.map(({ type }) => {
                    const selected = itemRows.some((row) => row.typeId === type._id);
                    const imageUrl = type.iconImageUrl || type.promoImageUrl;
                    return (
                      <button
                        key={type._id}
                        type="button"
                        className={cn(
                          "rounded-md border p-3 text-left transition-colors hover:bg-muted/60",
                          selected && "border-primary/50 bg-primary/5",
                        )}
                        onClick={() => addType(type._id)}
                      >
                        <div className="flex items-start gap-3">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt=""
                              className="h-12 w-12 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                              No img
                            </div>
                          )}
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-snug">
                              {formatTypeDisplay(type)}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {selected ? "In package — click to add another" : "Click to add"}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border p-3 text-sm">
        <p className="mb-2 font-medium">Line-item pricing</p>
        <div className="space-y-1 text-xs text-muted-foreground">
          {selectedItems.map((entry) => {
            const type = entry.type!;
            const sub = (type.subsidizedRentalPriceUsd ?? 0) * entry.quantity;
            const nonSub =
              (type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0) * entry.quantity;
            return (
              <p key={entry.row.typeId}>
                {entry.quantity}× {type.name}: Sub {formatCurrency(sub)} / Non {formatCurrency(nonSub)}
              </p>
            );
          })}
        </div>
        <div className="my-2 border-t" />
        <p>
          Suggested Subsidized:{" "}
          <span className="font-medium">{formatCurrency(Number(suggestedPricing.subsidized.toFixed(2)))}</span>
        </p>
        <p>
          Suggested Non-Subsidized:{" "}
          <span className="font-medium">{formatCurrency(Number(suggestedPricing.nonSubsidized.toFixed(2)))}</span>
        </p>
      </div>
    </div>
  );
}

export function useSuggestedPackagePricing(
  itemRows: PackageItemRow[],
  typeLookup: Map<string, InventoryTypeRow>,
) {
  return useMemo(() => {
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
}
