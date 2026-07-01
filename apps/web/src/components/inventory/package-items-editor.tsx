"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MultiSelectFilter } from "./multi-select-filter";
import { formatCurrency } from "./constants";
import {
  bucketForCategoryKey,
  formatTypeDisplay,
  groupRowsBySection,
  publicBucketLabels,
  sectionFilterOptions,
  type PublicPackageBucket,
} from "./package-section-utils";
import { cn } from "@/lib/utils";
import { InventoryAssetImage } from "./inventory-asset-image";

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

function quantityInPackage(itemRows: PackageItemRow[], typeId: string) {
  const row = itemRows.find((entry) => entry.typeId === typeId);
  return row ? parseQuantity(row.quantity) : 0;
}

export function PackageItemsEditor({
  itemRows,
  onItemRowsChange,
  types,
  inventoryItems,
  categories,
}: {
  itemRows: PackageItemRow[];
  onItemRowsChange: (rows: PackageItemRow[]) => void;
  types: InventoryTypeRow[];
  inventoryItems: InventoryItemRow[];
  categories: CategoryRow[] | undefined;
}) {
  const [panel, setPanel] = useState<"contents" | "catalog">("contents");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [sectionFilterIds, setSectionFilterIds] = useState<PublicPackageBucket[]>([]);
  const [typeFilterIds, setTypeFilterIds] = useState<string[]>([]);
  const [itemFilterIds, setItemFilterIds] = useState<string[]>([]);

  const typeLookup = useMemo(() => new Map(types.map((type) => [type._id, type])), [types]);

  const selectedItems = useMemo(() => {
    return itemRows
      .filter((row) => row.typeId && parseQuantity(row.quantity) > 0)
      .map((row) => {
        const type = typeLookup.get(row.typeId);
        const section = type ? bucketForCategoryKey(type.category, categories) : "misc";
        return {
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

  const totalUnits = useMemo(
    () => selectedItems.reduce((sum, entry) => sum + entry.quantity, 0),
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
      if (sectionFilterIds.length && !sectionFilterIds.includes(section)) return false;
      if (typeFilterIds.length && !typeFilterIds.includes(type._id)) return false;
      if (typeFilterTypeIds.size && !typeFilterTypeIds.has(type._id)) return false;
      if (!lowered) return true;
      const haystack = `${formatTypeDisplay(type)} ${type.category} ${type.description ?? ""}`.toLowerCase();
      return haystack.includes(lowered);
    });
  }, [catalogSearch, categories, sectionFilterIds, typeFilterIds, typeFilterTypeIds, types]);

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

  function updateQuantity(typeId: string, nextQuantity: number) {
    if (nextQuantity <= 0) {
      removeType(typeId);
      return;
    }
    onItemRowsChange(
      itemRows.map((row) =>
        row.typeId === typeId ? { ...row, quantity: String(nextQuantity) } : row,
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
    setPanel("contents");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
        <span>
          <span className="font-medium">{selectedItems.length}</span> type
          {selectedItems.length === 1 ? "" : "s"} ·{" "}
          <span className="font-medium">{totalUnits}</span> total unit{totalUnits === 1 ? "" : "s"}
        </span>
        <span className="text-muted-foreground">
          Suggested {formatCurrency(Number(suggestedPricing.nonSubsidized.toFixed(2)))} non-subsidized
        </span>
      </div>

      <div className="flex gap-1 rounded-md border p-1">
        <button
          type="button"
          className={cn(
            "flex-1 rounded px-3 py-2 text-sm font-medium transition-colors",
            panel === "contents" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setPanel("contents")}
        >
          In this package ({selectedItems.length})
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 rounded px-3 py-2 text-sm font-medium transition-colors",
            panel === "catalog" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setPanel("catalog")}
        >
          Add equipment
        </button>
      </div>

      {panel === "contents" ? (
        <div className="space-y-4">
          {!selectedItems.length ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-sm font-medium">No equipment added yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Switch to Add equipment to browse types and build the package.
              </p>
              <Button type="button" className="mt-4" variant="outline" onClick={() => setPanel("catalog")}>
                Browse equipment
              </Button>
            </div>
          ) : (
            <>
              {selectedSections.map((group) => (
                <section key={group.section} className="space-y-2">
                  <h4 className="text-sm font-semibold">{publicBucketLabels[group.section]}</h4>
                  <div className="space-y-2">
                    {group.rows.map((entry) => {
                      const type = entry.type!;
                      const imageUrl = type.iconImageUrl || type.promoImageUrl;
                      return (
                        <div
                          key={entry.row.typeId}
                          className="rounded-md border bg-card p-3"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              {imageUrl ? (
                                <InventoryAssetImage
                                  storedValue={imageUrl}
                                  alt=""
                                  className="h-14 w-14 shrink-0 rounded object-cover"
                                  fallbackClassName="h-14 w-14 shrink-0 rounded"
                                />
                              ) : (
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                                  No image
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium leading-snug">{type.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {formatTypeDisplay(type)}
                                </p>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-9 w-9 px-0"
                                  aria-label="Decrease quantity"
                                  onClick={() => updateQuantity(entry.row.typeId, entry.quantity - 1)}
                                >
                                  −
                                </Button>
                                <Input
                                  className="h-9 w-16 px-2 text-center"
                                  inputMode="numeric"
                                  aria-label="Quantity"
                                  value={entry.row.quantity}
                                  onChange={(event) => {
                                    const next = event.target.value.replace(/[^\d]/g, "");
                                    if (!next) {
                                      onItemRowsChange(
                                        itemRows.map((row) =>
                                          row.typeId === entry.row.typeId
                                            ? { ...row, quantity: "" }
                                            : row,
                                        ),
                                      );
                                      return;
                                    }
                                    updateQuantity(entry.row.typeId, parseQuantity(next));
                                  }}
                                  onBlur={() => {
                                    if (!entry.row.quantity.trim()) {
                                      updateQuantity(entry.row.typeId, 1);
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-9 w-9 px-0"
                                  aria-label="Increase quantity"
                                  onClick={() => updateQuantity(entry.row.typeId, entry.quantity + 1)}
                                >
                                  +
                                </Button>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => removeType(entry.row.typeId)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setPanel("catalog")}>
                  Add more equipment
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onItemRowsChange([])}
                >
                  Clear all
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Search equipment…"
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
            />
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

          {!catalogTypes.length ? (
            <p className="text-sm text-muted-foreground">No equipment matches the current filters.</p>
          ) : (
            <div className="max-h-[24rem] space-y-4 overflow-y-auto pr-1">
              {catalogSections.map((group) => (
                <section key={group.section} className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {publicBucketLabels[group.section]}
                  </h4>
                  <div className="space-y-2">
                    {group.rows.map(({ type }) => {
                      const inPackage = quantityInPackage(itemRows, type._id);
                      const imageUrl = type.iconImageUrl || type.promoImageUrl;
                      return (
                        <div
                          key={type._id}
                          className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            {imageUrl ? (
                              <InventoryAssetImage
                                storedValue={imageUrl}
                                alt=""
                                className="h-12 w-12 shrink-0 rounded object-cover"
                                fallbackClassName="h-12 w-12 shrink-0 rounded"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                                No img
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-snug">{formatTypeDisplay(type)}</p>
                              {inPackage ? (
                                <p className="text-xs text-primary">{inPackage} already in package</p>
                              ) : (
                                <p className="text-xs text-muted-foreground">Not in package yet</p>
                              )}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={inPackage ? "outline" : "default"}
                            className="shrink-0 self-start sm:self-center"
                            onClick={() => addType(type._id)}
                          >
                            {inPackage ? "Add another" : "Add to package"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedItems.length ? (
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Line-item pricing breakdown</summary>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
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
        </details>
      ) : null}
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
