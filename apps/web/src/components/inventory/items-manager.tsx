"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { CameraIcon, PackageIcon, PlusIcon } from "@phosphor-icons/react";
import { activeFilters, FilterBar, type FilterDefinition, type FilterState } from "@/components/filter-bar";
import { EmptyState, ListSummary, RowCell, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSheetParam } from "@/hooks/use-sheet-param";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { AssetScanner } from "./asset-scanner";
import { inventoryItemLabel, toCategoryOptions } from "./constants";
import { CreateAssetWizard } from "./create-asset-wizard";
import { DamageReportWizard } from "./damage-report-wizard";
import { ItemSheet } from "./item-sheet";
import { formatTypeDisplay } from "./package-section-utils";

const CONTAINER_OPTIONS = [
  { value: "inside", label: "Inside a container" },
  { value: "top", label: "Not inside anything" },
];

const TAG_OPTIONS = [
  { value: "tagged", label: "Has an asset tag" },
  { value: "serial_only", label: "Serial only" },
];

function plural(count: number, noun: string) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Every unit of gear: filter, scan to find one, open it in a side panel to
 * edit, nest or report damage. New units come in through the create wizard.
 */
export function ItemsManager() {
  const { confirm } = useAppDialog();
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useSheetParam("item");
  const [damageItemId, setDamageItemId] = useState<Id<"inventoryItems"> | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanRaw, setScanRaw] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  const categories = useQuery(api.inventoryCategories.list, { activeOnly: true });
  const { results: items, status, loadMore } = usePaginatedQuery(
    api.inventoryItems.list,
    { search: search || undefined, ...activeFilters(filters) },
    { initialNumItems: 100 },
  );
  const itemSummaries = useQuery(api.inventoryItems.listSummaries, {});
  const types = useQuery(api.inventoryTypes.listOptions, {});
  const locations = useQuery(api.storageLocations.list, {});
  const removeItem = useMutation(api.inventoryItems.remove);
  const scanResolved = useQuery(api.inventoryItems.resolveByScan, scanRaw.trim() ? { raw: scanRaw } : "skip");

  /** How many items each container holds, from summaries so the list query skips per-row child scans. */
  const childCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of itemSummaries ?? []) {
      if (item.containedInAssetId) map.set(item.containedInAssetId, (map.get(item.containedInAssetId) ?? 0) + 1);
    }
    return map;
  }, [itemSummaries]);

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      {
        id: "category",
        label: "Category",
        options: toCategoryOptions(categories).map((entry) => ({ value: entry.value, label: entry.label })),
      },
      {
        id: "type",
        label: "Type",
        options: (types ?? []).map((type) => ({ value: type._id, label: formatTypeDisplay(type) })),
      },
      {
        id: "location",
        label: "Location",
        options: [
          { value: "none", label: "Unassigned" },
          ...(locations ?? []).map((location) => ({ value: location._id, label: location.path })),
        ],
      },
      { id: "container", label: "Container", options: CONTAINER_OPTIONS, single: true },
      { id: "tag", label: "Asset tag", options: TAG_OPTIONS, single: true },
    ],
    [categories, locations, types],
  );

  /** Scan to find: open the scanned item's panel, wherever it is in the list. */
  useEffect(() => {
    if (!scanRaw.trim() || scanResolved === undefined) return;
    if (scanResolved === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- consume the one-shot scan resolution
      setScanError(`No item found for “${scanRaw.trim()}”.`);
      setScanRaw("");
      return;
    }
    setScanError(null);
    // Narrow the list to it too, so the row is on screen and selected behind the panel.
    setSearch(scanResolved.assetId);
    setFilters({});
    setSelected(new Set([scanResolved._id]));
    setSelectedId(scanResolved._id);
    setScanRaw("");
    setScanOpen(false);
  }, [scanResolved, scanRaw, setSelectedId]);

  const selectedIds = items.filter((item) => selected.has(item._id)).map((item) => item._id);
  const inContainers = items.filter((item) => item.containedInAssetId).length;
  const unassigned = items.filter((item) => !item.storageLocationId).length;
  const narrowed = Boolean(search.trim()) || Object.keys(activeFilters(filters)).length > 0;
  const allSelected = items.length > 0 && items.every((item) => selected.has(item._id));

  function withClearedSelection<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setSelected(new Set());
    };
  }

  async function deleteItem(item: { _id: Id<"inventoryItems">; label: string }) {
    const ok = await confirm({
      title: `Delete ${item.label}?`,
      description:
        "The unit leaves inventory and its public page stops working. A container that still holds anything can't be deleted; move its contents out first.",
      destructive: true,
      confirmLabel: "Delete item",
    });
    if (!ok) return false;
    try {
      await removeItem({ id: item._id });
      notify.success(`Deleted ${item.label}.`);
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not delete the item."));
      return false;
    }
  }

  async function bulkDelete() {
    const ok = await confirm({
      title: `Delete ${plural(selectedIds.length, "item")}?`,
      description: "Containers that still hold anything are skipped with an error; the rest leave inventory.",
      destructive: true,
      confirmLabel: `Delete ${plural(selectedIds.length, "item")}`,
    });
    if (!ok) return;
    setBulkPending(true);
    const outcomes = await Promise.allSettled(selectedIds.map((id) => removeItem({ id })));
    setBulkPending(false);
    const failed = outcomes.filter((outcome) => outcome.status === "rejected");
    if (outcomes.length - failed.length) notify.success(`Deleted ${plural(outcomes.length - failed.length, "item")}.`);
    if (failed.length) {
      notify.error(
        `${plural(failed.length, "item")} couldn't be deleted: ${getConvexErrorMessage((failed[0] as PromiseRejectedResult).reason)}`,
      );
    }
    setSelected(new Set());
  }

  return (
    <div className="space-y-4 pb-24" data-testid="items-page">
      <PageHeader
        title="Inventory Items"
        description="Every unit of gear Arbor owns. Scan a tag to find one, open it to edit, nest it in a case, or report damage."
        actions={
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setScanOpen((open) => !open)}>
              <CameraIcon />
              Scan
            </Button>
            <Button type="button" size="sm" onClick={() => setWizardOpen(true)}>
              <PlusIcon />
              New item
            </Button>
          </>
        }
        meta={
          itemSummaries ? (
            <MetaItem icon={PackageIcon}>{plural(itemSummaries.length, "unit")} in inventory</MetaItem>
          ) : null
        }
      />

      {scanOpen ? (
        <div className="border bg-muted/20 p-3" data-testid="items-scanner">
          <AssetScanner onSubmit={(raw) => setScanRaw(raw)} autoFocus />
          {scanError ? <p className="mt-2 text-sm text-destructive">{scanError}</p> : null}
        </div>
      ) : null}

      <FilterBar
        search={search}
        onSearchChange={withClearedSelection(setSearch)}
        searchPlaceholder="Search by asset ID, serial, model"
        searchLabel="Search items"
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
          <ListSummary testId="items-summary" order="By asset tag, then serial.">
            {plural(items.length, "item")}
            {status === "CanLoadMore" ? "+" : ""} · {inContainers} inside containers · {unassigned} without a location
          </ListSummary>

          {selectedIds.length ? (
            <div
              className="flex flex-wrap items-center gap-2 border border-status-blue-500/40 bg-status-blue-500/10 px-3 py-2 text-sm"
              data-testid="items-bulk-bar"
            >
              <span className="mr-auto font-medium">{plural(selectedIds.length, "item")} selected</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={bulkPending} onClick={() => void bulkDelete()}>
                Delete selected
              </Button>
            </div>
          ) : null}

          {items.length === 0 ? (
            <EmptyState
              action={
                narrowed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilters({});
                    }}
                  >
                    Clear search and filters
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => setWizardOpen(true)}>
                    Add the first item
                  </Button>
                )
              }
            >
              {status === "CanLoadMore"
                ? "Nothing matches in the items checked so far. Load more to keep looking."
                : narrowed
                  ? "No items match this search and these filters."
                  : "No inventory yet."}
            </EmptyState>
          ) : (
            <div className="border" data-testid="items-list">
              <div className="flex items-center gap-2 border-b bg-muted/20 py-2 pr-1 pl-3 text-xs font-medium text-muted-foreground">
                <Checkbox
                  aria-label="Select all items shown"
                  checked={allSelected ? true : selectedIds.length ? "indeterminate" : false}
                  onCheckedChange={(checked) =>
                    setSelected(checked === true ? new Set(items.map((item) => item._id)) : new Set())
                  }
                />
                <span className="flex-1">Item</span>
                <span className="hidden w-48 md:block">Location</span>
                <span className="hidden w-36 lg:block">Container</span>
                <span className="w-8" />
              </div>
              <ul className="divide-y [&>li]:border-0">
                {items.map((item) => {
                  const label = inventoryItemLabel(item);
                  const holds = childCount.get(item._id) ?? 0;
                  return (
                    <ListRow
                      key={item._id}
                      data-testid={`item-row-${item._id}`}
                      onOpen={() => setSelectedId(item._id)}
                      className={selectedId === item._id ? "bg-muted/40" : undefined}
                      leading={
                        <Checkbox
                          aria-label={`Select ${label}`}
                          checked={selected.has(item._id)}
                          onCheckedChange={(checked) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (checked === true) next.add(item._id);
                              else next.delete(item._id);
                              return next;
                            })
                          }
                        />
                      }
                      actions={
                        <RowMenu label={`More for ${label}`}>
                          <DropdownMenuItem onSelect={() => setSelectedId(item._id)}>Open details</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDamageItemId(item._id)}>Report damage</DropdownMenuItem>
                          {item.assetId ? (
                            <DropdownMenuItem asChild>
                              <a href={`${siteBase}/e/${encodeURIComponent(item.assetId)}`} target="_blank" rel="noreferrer">
                                Open public page
                              </a>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => void deleteItem({ _id: item._id, label })}>
                            Delete item
                          </DropdownMenuItem>
                        </RowMenu>
                      }
                    >
                      <RowText
                        eyebrow={item.type?.category ?? "Unknown category"}
                        title={label}
                        detail={[
                          formatTypeDisplay(item.type ?? { name: "Unknown type", model: "Unknown type" }),
                          item.assetId && item.serialNumber ? `SN ${item.serialNumber}` : null,
                          item.status,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                      <RowCell className="w-48 truncate" align="left" hideBelow="md" muted>
                        {item.location?.path ?? "No location"}
                      </RowCell>
                      <RowCell className="w-36 truncate" align="left" hideBelow="lg" muted>
                        {item.containedInAsset
                          ? `In ${inventoryItemLabel(item.containedInAsset)}`
                          : holds
                            ? `Holds ${holds}`
                            : "—"}
                      </RowCell>
                    </ListRow>
                  );
                })}
              </ul>
            </div>
          )}

          {status === "CanLoadMore" || status === "LoadingMore" ? (
            <Button type="button" variant="outline" disabled={status === "LoadingMore"} onClick={() => loadMore(100)}>
              {status === "LoadingMore" ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </>
      )}

      <ItemSheet
        itemId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        options={{
          types: types ?? [],
          locations: locations ?? [],
          items: (itemSummaries ?? []).map((item) => ({
            _id: item._id,
            assetId: item.assetId,
            serialNumber: item.serialNumber,
            type: item.type ?? undefined,
          })),
        }}
        siteBase={siteBase}
        onReportDamage={(id) => setDamageItemId(id)}
        onDelete={deleteItem}
      />
      <DamageReportWizard
        open={Boolean(damageItemId)}
        onOpenChange={(open) => {
          if (!open) setDamageItemId(null);
        }}
        initialInventoryItemId={damageItemId ?? undefined}
      />
      <CreateAssetWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
