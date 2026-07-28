"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/inventory/searchable-select";

const MIN_QUERY_CHARS = 2;
const DEBOUNCE_MS = 200;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type InventoryTypeOption = {
  _id: Id<"inventoryTypes">;
  name: string;
  model: string;
  manufacturer?: string;
  category: string;
  subsidizedRentalPriceUsd?: number;
  nonSubsidizedRentalPriceUsd?: number;
  rentalPriceUsd?: number;
};

export type InventoryPackageOption = {
  _id: Id<"inventoryPackages">;
  name: string;
  active: boolean;
  packagePriceCents: number;
  subsidizedPackagePriceUsd?: number;
  nonSubsidizedPackagePriceUsd?: number;
  items: Array<{
    typeId: Id<"inventoryTypes">;
    quantity: number;
    type: {
      name: string;
      model: string;
      subsidizedRentalPriceUsd?: number;
      nonSubsidizedRentalPriceUsd?: number;
      rentalPriceUsd?: number;
    } | null;
  }>;
};

function typeLabel(type: Pick<InventoryTypeOption, "name" | "model">) {
  return `${type.name} · ${type.model}`;
}

export function InventoryTypeSearchSelect({
  value,
  onChange,
  emptyLabel = "Select type",
  placeholder = "Type to search types…",
}: {
  value: string;
  onChange: (value: string, option: InventoryTypeOption | null) => void;
  emptyLabel?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  const canSearch = debouncedQuery.trim().length >= MIN_QUERY_CHARS;

  const selectedRows = useQuery(
    api.inventoryTypes.getOptionsByIds,
    value ? { ids: [value as Id<"inventoryTypes">] } : "skip",
  );
  const searchRows = useQuery(
    api.inventoryTypes.searchOptions,
    canSearch ? { search: debouncedQuery.trim() } : "skip",
  );

  const selected = selectedRows?.[0] ?? null;
  const options: SearchableSelectOption[] = useMemo(() => {
    const byId = new Map<string, SearchableSelectOption>();
    if (selected) {
      byId.set(selected._id, {
        value: selected._id,
        label: typeLabel(selected),
        description: selected.category,
        keywords: [selected.manufacturer, selected.model].filter(Boolean).join(" "),
      });
    }
    for (const row of searchRows ?? []) {
      byId.set(row._id, {
        value: row._id,
        label: typeLabel(row),
        description: row.category,
        keywords: [row.manufacturer, row.model].filter(Boolean).join(" "),
      });
    }
    return [...byId.values()];
  }, [searchRows, selected]);

  const optionById = useMemo(() => {
    const map = new Map<string, InventoryTypeOption>();
    if (selected) map.set(selected._id, selected);
    for (const row of searchRows ?? []) map.set(row._id, row);
    return map;
  }, [searchRows, selected]);

  return (
    <SearchableSelect
      value={value}
      onChange={(next) => onChange(next, optionById.get(next) ?? null)}
      options={options}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
      onQueryChange={setQuery}
      minQueryLength={MIN_QUERY_CHARS}
      searchHint={`Type at least ${MIN_QUERY_CHARS} characters to search`}
      searching={canSearch && searchRows === undefined}
    />
  );
}

export function InventoryPackageSearchSelect({
  value,
  onChange,
  emptyLabel = "Select package",
  placeholder = "Type to search packages…",
  activeOnly = false,
}: {
  value: string;
  onChange: (value: string, option: InventoryPackageOption | null) => void;
  emptyLabel?: string;
  placeholder?: string;
  activeOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  const canSearch = debouncedQuery.trim().length >= MIN_QUERY_CHARS;

  const selectedRows = useQuery(
    api.inventoryPackages.getOptionsByIds,
    value ? { ids: [value as Id<"inventoryPackages">] } : "skip",
  );
  const searchRows = useQuery(
    api.inventoryPackages.searchOptions,
    canSearch ? { search: debouncedQuery.trim(), activeOnly } : "skip",
  );

  const selected = selectedRows?.[0] ?? null;
  const options: SearchableSelectOption[] = useMemo(() => {
    const byId = new Map<string, SearchableSelectOption>();
    if (selected) {
      byId.set(selected._id, {
        value: selected._id,
        label: selected.name,
        description: `${selected.items.length} type${selected.items.length === 1 ? "" : "s"} in package`,
      });
    }
    for (const row of searchRows ?? []) {
      byId.set(row._id, {
        value: row._id,
        label: row.name,
        description: `${row.items.length} type${row.items.length === 1 ? "" : "s"} in package`,
      });
    }
    return [...byId.values()];
  }, [searchRows, selected]);

  const optionById = useMemo(() => {
    const map = new Map<string, InventoryPackageOption>();
    if (selected) map.set(selected._id, selected as InventoryPackageOption);
    for (const row of searchRows ?? []) map.set(row._id, row as InventoryPackageOption);
    return map;
  }, [searchRows, selected]);

  return (
    <SearchableSelect
      value={value}
      onChange={(next) => onChange(next, optionById.get(next) ?? null)}
      options={options}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
      onQueryChange={setQuery}
      minQueryLength={MIN_QUERY_CHARS}
      searchHint={`Type at least ${MIN_QUERY_CHARS} characters to search`}
      searching={canSearch && searchRows === undefined}
    />
  );
}
