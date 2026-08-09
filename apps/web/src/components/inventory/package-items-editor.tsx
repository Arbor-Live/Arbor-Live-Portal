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
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import {
  PackageContentsUnitsEditor,
  emptyContentUnit,
  type ContentUnitDraft,
} from "./package-contents-units-editor";

export type { ContentUnitDraft };

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

/** Fulfillment-equivalent lines: single-option units only (qty × per-unit). */
export function fulfillmentLinesFromUnits(units: ContentUnitDraft[]) {
  const merged = new Map<string, number>();
  for (const unit of units) {
    if (unit.options.length !== 1) continue;
    const option = unit.options[0]!;
    const scale = parseQuantity(unit.quantity);
    for (const item of option.items) {
      if (!item.typeId) continue;
      const qty = parseQuantity(item.quantity) * scale;
      merged.set(item.typeId, (merged.get(item.typeId) ?? 0) + qty);
    }
  }
  return Array.from(merged.entries()).map(([typeId, quantity]) => ({ typeId, quantity }));
}

export function PackageItemsEditor({
  units,
  onUnitsChange,
  types,
  inventoryItems,
  categories,
}: {
  units: ContentUnitDraft[];
  onUnitsChange: (units: ContentUnitDraft[]) => void;
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

  const fulfillmentLines = useMemo(() => fulfillmentLinesFromUnits(units), [units]);

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
    return fulfillmentLines.reduce(
      (acc, row) => {
        const type = typeLookup.get(row.typeId);
        if (!type) return acc;
        acc.subsidized += (type.subsidizedRentalPriceUsd ?? 0) * row.quantity;
        acc.nonSubsidized +=
          (type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0) * row.quantity;
        return acc;
      },
      { subsidized: 0, nonSubsidized: 0 },
    );
  }, [fulfillmentLines, typeLookup]);

  const totalUnits = useMemo(
    () => fulfillmentLines.reduce((sum, row) => sum + row.quantity, 0),
    [fulfillmentLines],
  );

  function quantityInPackage(typeId: string) {
    return fulfillmentLines.find((row) => row.typeId === typeId)?.quantity ?? 0;
  }

  function addType(typeId: string) {
    const existing = units.find(
      (unit) =>
        unit.options.length === 1 &&
        unit.options[0]?.items.length === 1 &&
        unit.options[0]?.items[0]?.typeId === typeId &&
        unit.options[0]?.items[0]?.role === "primary",
    );
    if (existing) {
      onUnitsChange(
        units.map((unit) =>
          unit.key === existing.key
            ? { ...unit, quantity: String(parseQuantity(unit.quantity) + 1) }
            : unit,
        ),
      );
    } else {
      onUnitsChange([...units, emptyContentUnit(typeId)]);
    }
    setPanel("contents");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
        <span>
          <span className="font-medium">{units.length}</span> unit
          {units.length === 1 ? "" : "s"} ·{" "}
          <span className="font-medium">{fulfillmentLines.length}</span> included type
          {fulfillmentLines.length === 1 ? "" : "s"} ·{" "}
          <span className="font-medium">{totalUnits}</span> total
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
          In this package ({units.length})
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
        <div className="space-y-3">
          <PackageContentsUnitsEditor units={units} onChange={onUnitsChange} types={types} />
          {units.length ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setPanel("catalog")}>
                Add more equipment
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => onUnitsChange([])}
              >
                Clear all
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <Button type="button" variant="outline" onClick={() => setPanel("catalog")}>
                Browse equipment
              </Button>
            </div>
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

          <div className="max-h-[28rem] space-y-4 overflow-y-auto rounded-md border p-3">
            {catalogSections.map((group) => (
              <section key={group.section} className="space-y-2">
                <h4 className="text-sm font-semibold">{publicBucketLabels[group.section]}</h4>
                <div className="space-y-2">
                  {group.rows.map(({ type }) => {
                    const inPackage = quantityInPackage(type._id);
                    const imageUrl = type.iconImageUrl || type.promoImageUrl;
                    return (
                      <div
                        key={type._id}
                        data-testid={`package-catalog-row-${type._id}`}
                        className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          {imageUrl ? (
                            <StoredAssetImage
                              storedValue={imageUrl}
                              alt=""
                              className="h-12 w-12 shrink-0 rounded object-cover"
                              fallbackClassName="h-12 w-12 shrink-0 rounded"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
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
                        <div className="flex shrink-0 items-center gap-2">
                          {inPackage > 0 ? (
                            <span className="text-xs text-muted-foreground">{inPackage}× included</span>
                          ) : null}
                          <Button type="button" size="sm" onClick={() => addType(type._id)}>
                            {inPackage > 0 ? "Add another" : "Add to package"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {!catalogSections.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No types match filters.</p>
            ) : null}
          </div>

          <details className="rounded-md border bg-muted/10 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Suggested package pricing</summary>
            <p className="mt-2">
              Suggested Subsidized:{" "}
              <span className="font-medium">{formatCurrency(Number(suggestedPricing.subsidized.toFixed(2)))}</span>
            </p>
            <p>
              Suggested Non-Subsidized:{" "}
              <span className="font-medium">
                {formatCurrency(Number(suggestedPricing.nonSubsidized.toFixed(2)))}
              </span>
            </p>
          </details>
        </div>
      )}
    </div>
  );
}

export function useSuggestedPackagePricing(
  units: ContentUnitDraft[],
  typeLookup: Map<string, InventoryTypeRow>,
) {
  return useMemo(() => {
    return fulfillmentLinesFromUnits(units).reduce(
      (acc, row) => {
        const type = typeLookup.get(row.typeId);
        if (!type) return acc;
        acc.subsidized += (type.subsidizedRentalPriceUsd ?? 0) * row.quantity;
        acc.nonSubsidized +=
          (type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0) * row.quantity;
        return acc;
      },
      { subsidized: 0, nonSubsidized: 0 },
    );
  }, [typeLookup, units]);
}
