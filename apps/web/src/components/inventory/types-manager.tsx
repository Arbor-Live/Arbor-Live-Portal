"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { CaretDownIcon, PackageIcon, PlusIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { activeFilters, FilterBar, type FilterDefinition, type FilterState } from "@/components/filter-bar";
import { MetaItem, PageHeader } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { toCategoryOptions } from "./constants";
import { TYPE_VISIBILITY_LABELS, type InventoryTypeRow, type TypeVisibility } from "./type-form";
import { TypeSettingsDialog, type TypeSettingsTab } from "./type-settings-dialog";
import { TypeSheet } from "./type-sheet";
import { TypesTable } from "./types-table";
import { formatTypeDisplay } from "./package-section-utils";

const VISIBILITY_OPTIONS = (Object.keys(TYPE_VISIBILITY_LABELS) as TypeVisibility[]).map((value) => ({
  value,
  label: TYPE_VISIBILITY_LABELS[value],
}));

const UNITS_OPTIONS = [
  { value: "has", label: "Has units" },
  { value: "none", label: "No units yet" },
];

/** `?type=<id>` opens that type's panel; `?type=new` opens an empty one. */
const TYPE_PARAM = "type";

function setTypeParam(value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(TYPE_PARAM, value);
  else url.searchParams.delete(TYPE_PARAM);
  window.history.replaceState(null, "", url);
}

function plural(count: number, noun: string, nouns = `${noun}s`) {
  return `${count.toLocaleString()} ${count === 1 ? noun : nouns}`;
}

async function attempt(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    notify.success(success);
    return true;
  } catch (error) {
    notify.error(getConvexErrorMessage(error));
    return false;
  }
}

export function TypesManager() {
  const { confirm } = useAppDialog();
  const searchParams = useSearchParams();
  const [panel, setPanel] = useState<string | null>(() => searchParams.get(TYPE_PARAM));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<TypeSettingsTab>("categories");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);

  const categories = useQuery(api.inventoryCategories.list, { activeOnly: false });
  const capabilities = useQuery(api.capabilityDefinitions.list, { activeOnly: false });
  const manufacturers = useQuery(api.inventoryTypes.listManufacturers, {});
  const units = useQuery(api.inventoryTypes.unitCounts, {});
  // Chips still being set up (no value yet) don't touch the query.
  const applied = activeFilters(filters);
  const { results, status, loadMore } = usePaginatedQuery(
    api.inventoryTypes.list,
    {
      search: search.trim() || undefined,
      category: applied.category,
      capability: applied.capability,
      manufacturer: applied.manufacturer,
      visibility: applied.visibility,
      units: applied.units,
    },
    { initialNumItems: 100 },
  );

  const ensureDefaults = useMutation(api.inventoryCategories.ensureDefaults);
  const deleteType = useMutation(api.inventoryTypes.remove);
  const bulkUpdateVisibility = useMutation(api.inventoryTypes.bulkUpdateVisibility);

  useEffect(() => {
    if (categories === undefined || categories.length > 0) return;
    void ensureDefaults({}).catch(() => {
      // Admin-only seed; type create also seeds server-side when needed.
    });
  }, [categories, ensureDefaults]);

  // Pages arrive sorted one at a time; sort the whole list so rows never jump between pages.
  const rows = useMemo(
    () => [...results].sort((a, b) => formatTypeDisplay(a).localeCompare(formatTypeDisplay(b))),
    [results],
  );

  const categoryOptions = useMemo(() => toCategoryOptions(categories), [categories]);
  const categoryLabels = useMemo(
    () => new Map((categories ?? []).map((category) => [category.key, category.label])),
    [categories],
  );
  const capabilityLabels = useMemo(
    () => new Map((capabilities ?? []).map((entry) => [entry.key, entry.label])),
    [capabilities],
  );
  const unitCounts = useMemo(
    () => (units ? new Map<string, number>(units.counts.map((entry) => [entry.typeId, entry.units])) : undefined),
    [units],
  );
  const activeCapabilities = useMemo(() => (capabilities ?? []).filter((entry) => entry.active), [capabilities]);

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      {
        id: "category",
        label: "Category",
        options: categoryOptions.map((category) => ({ value: category.value, label: category.label })),
      },
      {
        id: "capability",
        label: "Capability",
        options: (capabilities ?? []).map((entry) => ({
          value: entry.key,
          label: entry.label,
          description: entry.active ? undefined : "Inactive",
        })),
      },
      {
        id: "manufacturer",
        label: "Manufacturer",
        options: (manufacturers ?? []).map((entry) => ({ value: entry, label: entry })),
      },
      { id: "visibility", label: "Visibility", options: VISIBILITY_OPTIONS },
      { id: "units", label: "Units", options: UNITS_OPTIONS, single: true },
    ],
    [capabilities, categoryOptions, manufacturers],
  );
  const panelIsNew = panel === "new";
  const panelId = panel && !panelIsNew ? panel : null;
  const loadedPanelRow = panelId ? rows.find((row) => row._id === panelId) : undefined;
  // A deep-linked type may sit on a page that isn't loaded, or outside the filters.
  const fetchedPanelRow = useQuery(
    api.inventoryTypes.get,
    panelId && !loadedPanelRow ? { id: panelId } : "skip",
  );
  const panelRow = loadedPanelRow ?? fetchedPanelRow ?? null;

  const filterCount = (search.trim() ? 1 : 0) + Object.keys(applied).length;
  const selectedIds = rows.filter((row) => selected.has(row._id)).map((row) => row._id);
  const shownUnits = unitCounts ? rows.reduce((sum, row) => sum + (unitCounts.get(row._id) ?? 0), 0) : undefined;
  const listedCount = rows.filter((row) => row.publicListing).length;
  const profileCount = rows.filter((row) => row.publicListing && row.publicProfile).length;

  function openPanel(value: string | null) {
    setPanel(value);
    setTypeParam(value);
  }

  function openSettings(tab: TypeSettingsTab) {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  // Any filter change starts the selection over, so a bulk action only covers rows on screen.
  function withClearedSelection<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setSelected(new Set());
    };
  }

  function clearFilters() {
    setSearch("");
    setFilters({});
    setSelected(new Set());
  }

  async function removeType(row: InventoryTypeRow) {
    const ok = await confirm({
      title: `Delete ${formatTypeDisplay(row)}?`,
      description:
        "The type is removed from the catalog and the public pages. A type that still has units in inventory or sits in a package can't be deleted.",
      destructive: true,
      confirmLabel: "Delete type",
    });
    if (!ok) return false;
    const deleted = await attempt(() => deleteType({ id: row._id }), `Deleted ${row.name}`);
    if (deleted && panel === row._id) openPanel(null);
    return deleted;
  }

  async function setVisibilityFor(ids: Id<"inventoryTypes">[], args: { publicListing?: boolean; publicProfile?: boolean }) {
    if (!ids.length) return;
    setBulkPending(true);
    const ok = await attempt(
      () => bulkUpdateVisibility({ ids, ...args }),
      `Updated ${plural(ids.length, "type")}`,
    );
    setBulkPending(false);
    if (ok) setSelected(new Set());
  }

  async function bulkDelete() {
    const ok = await confirm({
      title: `Delete ${plural(selectedIds.length, "type")}?`,
      description:
        "Types that still have units in inventory or sit in a package are skipped with an error; the rest are removed.",
      destructive: true,
      confirmLabel: `Delete ${plural(selectedIds.length, "type")}`,
    });
    if (!ok) return;
    setBulkPending(true);
    const outcomes = await Promise.allSettled(selectedIds.map((id) => deleteType({ id })));
    setBulkPending(false);
    const failed = outcomes.filter((outcome) => outcome.status === "rejected");
    const deleted = outcomes.length - failed.length;
    if (deleted) notify.success(`Deleted ${plural(deleted, "type")}`);
    if (failed.length) {
      notify.error(
        `${plural(failed.length, "type")} couldn't be deleted: ${getConvexErrorMessage((failed[0] as PromiseRejectedResult).reason)}`,
      );
    }
    setSelected(new Set());
  }

  return (
    <div className="space-y-4 pb-24" data-testid="types-page">
      <PageHeader
        title="Types"
        description="Every model of gear Arbor owns or rents. Units in Items, package lines and pull lists all point at a type, and listed types show on the public equipment pages."
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => openSettings("categories")}>
              <SlidersHorizontalIcon />
              Settings
            </Button>
            <Button type="button" size="sm" onClick={() => openPanel("new")}>
              <PlusIcon />
              New type
            </Button>
          </>
        }
        meta={
          <>
            <MetaItem icon={PackageIcon}>
              {unitCounts ? plural([...unitCounts.values()].reduce((sum, n) => sum + n, 0), "unit") : "Counting units…"}
              {units?.truncated ? "+" : ""} in inventory
            </MetaItem>
            <MetaItem icon={SlidersHorizontalIcon} onClick={() => openSettings("categories")}>
              {categories ? plural(categories.filter((entry) => entry.active).length, "category", "categories") : "…"}
            </MetaItem>
            <MetaItem icon={SlidersHorizontalIcon} onClick={() => openSettings("capabilities")}>
              {capabilities ? plural(activeCapabilities.length, "capability key") : "…"}
            </MetaItem>
          </>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={withClearedSelection(setSearch)}
        searchPlaceholder="Search name, model, maker, capability, slug…"
        searchLabel="Search types"
        filters={filterDefinitions}
        value={filters}
        onChange={withClearedSelection(setFilters)}
      />

      {status === "LoadingFirstPage" ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="space-y-0.5">
            <p className="text-sm" data-testid="types-summary">
              {plural(rows.length, "type")}
              {shownUnits !== undefined ? ` · ${plural(shownUnits, "unit")}` : ""} · {listedCount} listed publicly (
              {profileCount} with a full profile)
              {status === "CanLoadMore" ? " · more to load" : ""}
            </p>
            <p className="text-sm text-muted-foreground">A to Z by maker and name. Open a type to edit it.</p>
          </div>

          {selectedIds.length ? (
            <div
              className="flex flex-wrap items-center gap-2 border border-status-blue-500/40 bg-status-blue-500/10 px-3 py-2 text-sm"
              data-testid="types-bulk-bar"
            >
              <span className="mr-auto font-medium">{plural(selectedIds.length, "type")} selected</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkPending}
                onClick={() => void setVisibilityFor(selectedIds, { publicListing: true })}
              >
                List publicly
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkPending}
                onClick={() => void setVisibilityFor(selectedIds, { publicListing: false, publicProfile: false })}
              >
                Hide from public
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkPending}
                onClick={() => void setVisibilityFor(selectedIds, { publicProfile: true })}
              >
                Enable full profile
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkPending}
                onClick={() => void setVisibilityFor(selectedIds, { publicProfile: false })}
              >
                Disable full profile
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" disabled={bulkPending}>
                    More
                    <CaretDownIcon className="size-3" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => setSelected(new Set())}>Clear selection</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => void bulkDelete()}>
                    Delete selected
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <div className="space-y-2 border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              <p>
                {filterCount
                  ? "No types match this search and these filters."
                  : "No types yet. Add the first model with New type, then add its units from Items."}
              </p>
              {filterCount ? (
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  Clear search and filters
                </Button>
              ) : null}
            </div>
          ) : (
            <TypesTable
              rows={rows}
              categoryLabels={categoryLabels}
              capabilityLabels={capabilityLabels}
              unitCounts={unitCounts}
              selected={selected}
              onSelectedChange={setSelected}
              onOpen={(row) => openPanel(row._id)}
              onSetVisibility={(row, args) => void setVisibilityFor([row._id], args)}
              onDelete={(row) => void removeType(row)}
            />
          )}

          {status === "CanLoadMore" || status === "LoadingMore" ? (
            <Button type="button" variant="outline" disabled={status === "LoadingMore"} onClick={() => loadMore(100)}>
              {status === "LoadingMore" ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </>
      )}

      <TypeSheet
        open={panelIsNew || panelRow !== null}
        row={panelIsNew ? null : panelRow}
        unitCount={panelRow ? unitCounts?.get(panelRow._id) : undefined}
        categoryOptions={categoryOptions}
        capabilityOptions={activeCapabilities}
        onOpenChange={(open) => {
          if (!open) openPanel(null);
        }}
        onDelete={removeType}
      />
      <TypeSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        categories={categories}
        capabilities={capabilities}
      />
    </div>
  );
}
