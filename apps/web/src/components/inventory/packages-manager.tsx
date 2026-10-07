"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { CaretDownIcon, GlobeIcon, PackageIcon, PlusIcon } from "@phosphor-icons/react";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { EmptyState, ListSummary } from "@/components/list-page";
import { MetaItem, PageHeader } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { plural } from "@/lib/format";
import { notify } from "@/lib/notify";
import { inventoryItemLabel } from "./constants";
import { packageSection, packageStatus, packageTypeIds, packagePriceUsd, type PackageRow } from "./package-form";
import {
  bucketForCategoryKey,
  formatTypeDisplay,
  groupRowsBySection,
  publicBucketLabels,
  sectionFilterOptions,
  sectionOrder,
} from "./package-section-utils";
import { PackageSheet } from "./package-sheet";
import { PackagesTable } from "./packages-table";

const SORT_LABELS = {
  section: "Section",
  name: "Name",
  price: "Price",
  value: "Est. value",
} as const;

type SortKey = keyof typeof SORT_LABELS;

const ORDER_RULES: Record<SortKey, { asc: string; desc: string }> = {
  section: { asc: "By section, then A to Z.", desc: "By section in reverse, then Z to A." },
  name: { asc: "A to Z by name.", desc: "Z to A by name." },
  price: { asc: "Cheapest first.", desc: "Most expensive first." },
  value: { asc: "Lowest estimated value first.", desc: "Highest estimated value first." },
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const PUBLIC_OPTIONS = [
  { value: "listed", label: "Listed publicly" },
  { value: "hidden", label: "Hidden" },
];

/** `?package=<id>` opens that package's panel; `?package=new` opens an empty one. */
const PACKAGE_PARAM = "package";

function setPackageParam(value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(PACKAGE_PARAM, value);
  else url.searchParams.delete(PACKAGE_PARAM);
  window.history.replaceState(null, "", url);
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

export function PackagesManager() {
  const { confirm } = useAppDialog();
  const searchParams = useSearchParams();
  const [panel, setPanel] = useState<string | null>(() => searchParams.get(PACKAGE_PARAM));
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("section");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // The list is bounded server-side (500), so it loads whole and filters run here.
  const packages = useQuery(api.inventoryPackages.list, {});
  const types = useQuery(api.inventoryTypes.listOptions, {});
  const inventoryItems = useQuery(api.inventoryItems.listSummaries, {});
  const categories = useQuery(api.inventoryCategories.list, { activeOnly: true });

  const removePackage = useMutation(api.inventoryPackages.remove);

  /** Item ids → their type ids: a package "has" an item when one of its lines uses that item's type. */
  const itemTypeById = useMemo(
    () => new Map((inventoryItems ?? []).map((item) => [item._id as string, item.typeId as string])),
    [inventoryItems],
  );

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      { id: "section", label: "Section", options: sectionFilterOptions },
      {
        id: "type",
        label: "Type",
        options: (types ?? []).map((type) => ({
          value: type._id,
          label: formatTypeDisplay(type),
          description: publicBucketLabels[bucketForCategoryKey(type.category, categories)],
          keywords: type.category,
        })),
      },
      {
        id: "item",
        label: "Inventory item",
        options: (inventoryItems ?? []).map((item) => ({
          value: item._id,
          label: inventoryItemLabel(item),
          description: item.type ? formatTypeDisplay(item.type) : "Unknown type",
          keywords: item.type?.category,
        })),
      },
      { id: "status", label: "Status", options: STATUS_OPTIONS, single: true },
      { id: "public", label: "Public", options: PUBLIC_OPTIONS, single: true },
    ],
    [categories, inventoryItems, types],
  );

  const sections = useMemo(
    () => new Map((packages ?? []).map((pkg) => [pkg._id as string, packageSection(pkg, categories)])),
    [categories, packages],
  );
  const sectionOf = useCallback(
    (pkg: PackageRow) => sections.get(pkg._id) ?? packageSection(pkg, categories),
    [categories, sections],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const itemFilter = filters.item
      ? {
          ...filters.item,
          values: filters.item.values
            .map((id) => itemTypeById.get(id))
            .filter((id): id is string => Boolean(id)),
        }
      : undefined;
    const filtered = (packages ?? []).filter((pkg) => {
      if (
        needle &&
        !`${pkg.name} ${pkg.publicSlug ?? ""} ${pkg.description ?? ""}`.toLowerCase().includes(needle)
      ) {
        return false;
      }
      const typeIds = packageTypeIds(pkg);
      return (
        matchesFilter(filters.section, sectionOf(pkg)) &&
        matchesFilter(filters.type, typeIds) &&
        matchesFilter(itemFilter, typeIds) &&
        matchesFilter(filters.status, pkg.active ? "active" : "inactive") &&
        matchesFilter(filters.public, pkg.publicListing ? "listed" : "hidden")
      );
    });

    const direction = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sortBy === "section") {
        const bySection = sectionOrder.indexOf(sectionOf(a)) - sectionOrder.indexOf(sectionOf(b));
        if (bySection !== 0) return bySection * direction;
      }
      if (sortBy === "price") return (packagePriceUsd(a) - packagePriceUsd(b)) * direction;
      if (sortBy === "value") {
        return ((a.estimatedRentalValueUsd ?? 0) - (b.estimatedRentalValueUsd ?? 0)) * direction;
      }
      return a.name.localeCompare(b.name) * direction;
    });
  }, [filters, itemTypeById, packages, search, sectionOf, sortBy, sortDir]);

  const groups = useMemo(() => {
    if (sortBy !== "section") return null;
    return groupRowsBySection(rows.map((pkg) => ({ pkg, section: sectionOf(pkg) }))).map((group) => ({
      section: group.section,
      rows: group.rows.map((entry) => entry.pkg),
    }));
  }, [rows, sectionOf, sortBy]);

  const panelIsNew = panel === "new";
  const panelId = panel && !panelIsNew ? panel : null;
  const panelRow = panelId ? (packages?.find((pkg) => pkg._id === panelId) ?? null) : null;
  // Set while this page deletes a package, so its own delete isn't reported as a dead link.
  const deletingIdRef = useRef<string | null>(null);

  // A `?package=` link to a package that doesn't exist: say so and drop the param.
  useEffect(() => {
    if (!panelId || packages === undefined || panelRow) return;
    if (deletingIdRef.current !== panelId) {
      notify.error("That package doesn't exist anymore. It may have been deleted.");
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the panel once the list says the package is gone
    setPanel(null);
    setPackageParam(null);
  }, [packages, panelId, panelRow]);

  const applied = activeFilters(filters);
  const filterCount = (search.trim() ? 1 : 0) + Object.keys(applied).length;
  const selectedRows = rows.filter((row) => selected.has(row._id));
  const activeCount = rows.filter((row) => row.active).length;
  const listedCount = rows.filter((row) => packageStatus(row) === "listed").length;
  const allPackages = packages ?? [];

  function openPanel(value: string | null) {
    setPanel(value);
    setPackageParam(value);
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

  async function deletePackage(row: PackageRow) {
    const ok = await confirm({
      title: `Delete ${row.name}?`,
      description: row.publicListing
        ? "The package and its contents list are removed, and it drops off the public package pages. The equipment types it used stay in the catalog."
        : "The package and its contents list are removed. The equipment types it used stay in the catalog.",
      destructive: true,
      confirmLabel: "Delete package",
    });
    if (!ok) return false;
    deletingIdRef.current = row._id;
    const deleted = await attempt(() => removePackage({ id: row._id }), `Deleted ${row.name}`);
    if (deleted) {
      if (panel === row._id) openPanel(null);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(row._id);
        return next;
      });
    }
    deletingIdRef.current = null;
    return deleted;
  }

  async function bulkDelete() {
    const targets = selectedRows;
    const ok = await confirm({
      title: `Delete ${plural(targets.length, "package")}?`,
      description:
        "Each package and its contents list are removed, and listed ones drop off the public pages. The equipment types they used stay in the catalog.",
      destructive: true,
      confirmLabel: `Delete ${plural(targets.length, "package")}`,
    });
    if (!ok) return;
    setBulkPending(true);
    const outcomes = await Promise.allSettled(targets.map((row) => removePackage({ id: row._id })));
    setBulkPending(false);
    const failed = outcomes.filter((outcome) => outcome.status === "rejected");
    const deleted = outcomes.length - failed.length;
    if (deleted) notify.success(`Deleted ${plural(deleted, "package")}`);
    if (failed.length) {
      notify.error(
        `${plural(failed.length, "package")} couldn't be deleted: ${getConvexErrorMessage((failed[0] as PromiseRejectedResult).reason)}`,
      );
    }
    setSelected(new Set());
  }

  return (
    <div className="space-y-4 pb-24" data-testid="packages-page">
      <PageHeader
        title="Packages"
        description="Ready-made kits of equipment, priced as one. Listed packages also show on the public package pages."
        actions={
          <Button type="button" size="sm" onClick={() => openPanel("new")}>
            <PlusIcon />
            New package
          </Button>
        }
        meta={
          packages ? (
            <>
              <MetaItem icon={PackageIcon}>
                {plural(allPackages.length, "package")} · {allPackages.filter((pkg) => pkg.active).length} active
              </MetaItem>
              <MetaItem icon={GlobeIcon}>
                {allPackages.filter((pkg) => packageStatus(pkg) === "listed").length} listed publicly
              </MetaItem>
            </>
          ) : undefined
        }
      />

      <FilterBar
        search={search}
        onSearchChange={withClearedSelection(setSearch)}
        searchPlaceholder="Search name, slug, description…"
        searchLabel="Search packages"
        filters={filterDefinitions}
        value={filters}
        onChange={withClearedSelection(setFilters)}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="font-normal">
              Sort: {SORT_LABELS[sortBy]}, {sortDir === "asc" ? "ascending" : "descending"}
              <CaretDownIcon className="size-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={sortDir} onValueChange={(value) => setSortDir(value as "asc" | "desc")}>
              <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </FilterBar>

      {packages === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <ListSummary
            testId="packages-summary"
            order={`${ORDER_RULES[sortBy][sortDir]} Open a package to edit it.`}
          >
            {plural(rows.length, "package")} · {activeCount} active · {listedCount} listed publicly
            {filterCount ? ` (of ${allPackages.length.toLocaleString()})` : ""}
          </ListSummary>

          {selectedRows.length ? (
            <div
              className="flex flex-wrap items-center gap-2 border border-status-blue-500/40 bg-status-blue-500/10 px-3 py-2 text-sm"
              data-testid="packages-bulk-bar"
            >
              <span className="mr-auto font-medium">{plural(selectedRows.length, "package")} selected</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={bulkPending}
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={bulkPending}
                onClick={() => void bulkDelete()}
              >
                Delete selected
              </Button>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState
              action={
                filterCount ? (
                  <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                    Clear search and filters
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => openPanel("new")}>
                    <PlusIcon />
                    New package
                  </Button>
                )
              }
            >
              {filterCount
                ? "No packages match this search and these filters."
                : "No packages yet. Bundle equipment types into a rentable kit with New package."}
            </EmptyState>
          ) : (
            <PackagesTable
              rows={rows}
              groups={groups}
              sectionOf={sectionOf}
              selected={selected}
              onSelectedChange={setSelected}
              onOpen={(row) => openPanel(row._id)}
              onDelete={(row) => void deletePackage(row)}
            />
          )}
        </>
      )}

      <PackageSheet
        open={panelIsNew || panelRow !== null}
        row={panelIsNew ? null : panelRow}
        types={types ?? []}
        inventoryItems={inventoryItems ?? []}
        categories={categories}
        onOpenChange={(open) => {
          if (!open) openPanel(null);
        }}
        onDelete={deletePackage}
      />
    </div>
  );
}
