"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { MapPinIcon, PlusIcon } from "@phosphor-icons/react";
import { FilterBar, matchesFilter, activeFilters, type FilterDefinition, type FilterState } from "@/components/filter-bar";
import { DetailSheet, DetailSheetHeader, EmptyState, ListSummary, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader } from "@/components/page-header";
import { TreeRowLeading } from "@/components/tree-row";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSheetParam } from "@/hooks/use-sheet-param";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import {
  buildTree,
  collectParentIds,
  countDescendants,
  filterTree,
  flattenVisibleIds,
  type TreeNode,
} from "@/lib/tree";
import { StorageLocationEditor, type StorageLocationRow } from "./storage-location-editor";

type LocationNode = TreeNode<StorageLocationRow>;

const LEVEL_OPTIONS = [
  { value: "top", label: "Top level" },
  { value: "nested", label: "Inside another location" },
];

const CONTENTS_OPTIONS = [
  { value: "has", label: "Has locations inside" },
  { value: "none", label: "Nothing inside" },
];

function plural(count: number, noun: string) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
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

/**
 * Where gear is kept: warehouses and vans, with the rooms, shelves and bins
 * inside them as a tree. Open one in a side panel to rename or move it.
 * `?location=<id>` opens a location, `?location=new` a new one (with
 * `&parent=<id>` to start it inside another).
 */
export function StorageLocationsManager() {
  const { confirm } = useAppDialog();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [panel, setPanel] = useSheetParam("location");
  const [parentParam, setParentParam] = useSheetParam("parent");
  /** null = not initialized yet; once set, the user controls expansion. */
  const [expandedIds, setExpandedIds] = useState<Set<string> | null>(null);
  const locations = useQuery(api.storageLocations.list, {});
  const removeLocation = useMutation(api.storageLocations.remove);

  const byId = useMemo(
    () => new Map((locations ?? []).map((location) => [location._id as string, location])),
    [locations],
  );
  const editingId = panel && panel !== "new" ? (panel as Id<"storageLocations">) : null;
  const editing = editingId ? (byId.get(editingId) ?? null) : null;
  const newParent = panel === "new" && parentParam ? (byId.get(parentParam) ?? null) : null;

  const narrowed = Boolean(search.trim()) || Object.keys(activeFilters(filters)).length > 0;
  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      { id: "level", label: "Level", options: LEVEL_OPTIONS, single: true },
      { id: "contents", label: "Contents", options: CONTENTS_OPTIONS, single: true },
    ],
    [],
  );

  const parentIds = useMemo(
    () => new Set((locations ?? []).flatMap((location) => (location.parentId ? [location.parentId as string] : []))),
    [locations],
  );

  const tree = useMemo(() => {
    const q = search.trim().toLowerCase();
    const roots = buildTree((locations ?? []) as StorageLocationRow[], (a, b) => a.name.localeCompare(b.name));
    if (!narrowed) return roots;
    return filterTree(
      roots,
      (location) =>
        (!q || location.name.toLowerCase().includes(q) || location.path.toLowerCase().includes(q)) &&
        matchesFilter(filters.level, location.parentId ? "nested" : "top") &&
        matchesFilter(filters.contents, parentIds.has(location._id) ? "has" : "none"),
    );
  }, [filters, locations, narrowed, parentIds, search]);

  // Default: every branch open, so the nesting is obvious on first load.
  const resolvedExpandedIds = useMemo(() => expandedIds ?? collectParentIds(tree), [expandedIds, tree]);
  // While narrowed, open every branch that survived so each match is on screen.
  const displayExpandedIds = useMemo(
    () => (narrowed ? new Set([...resolvedExpandedIds, ...collectParentIds(tree)]) : resolvedExpandedIds),
    [narrowed, resolvedExpandedIds, tree],
  );
  const visibleCount = useMemo(() => flattenVisibleIds(tree, displayExpandedIds).length, [tree, displayExpandedIds]);
  const allParentIds = useMemo(() => collectParentIds(tree), [tree]);
  const allExpanded = allParentIds.size > 0 && [...allParentIds].every((id) => displayExpandedIds.has(id));

  const total = locations?.length ?? 0;
  const topLevel = (locations ?? []).filter((location) => !location.parentId).length;

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev ?? collectParentIds(tree));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openLocation(id: string) {
    setParentParam(null);
    setPanel(id);
  }

  function openNew(parentId?: string) {
    setParentParam(parentId ?? null);
    setPanel("new");
  }

  function closePanel() {
    setParentParam(null);
    setPanel(null);
  }

  async function deleteLocation(location: StorageLocationRow) {
    const inside = (locations ?? []).filter((row) => row.parentId === location._id).length;
    if (inside) {
      notify.error(`${location.name} has ${plural(inside, "location")} inside it. Move or delete them first.`);
      return false;
    }
    const ok = await confirm({
      title: `Delete ${location.name}?`,
      description:
        "It leaves the storage location list and the item location pickers. A location that items are still stored in can't be deleted; move them first.",
      destructive: true,
      confirmLabel: "Delete location",
    });
    if (!ok) return false;
    const deleted = await attempt(() => removeLocation({ id: location._id }), `Deleted ${location.name}.`);
    if (deleted && editingId === location._id) closePanel();
    return deleted;
  }

  function renderRows(nodes: LocationNode[], depth: number): ReactNode[] {
    const rows: ReactNode[] = [];
    for (const node of nodes) {
      const location = node.item;
      const hasChildren = node.children.length > 0;
      const isExpanded = hasChildren && displayExpandedIds.has(location._id);
      const descendants = hasChildren ? countDescendants(node) : 0;
      rows.push(
        <ListRow
          key={location._id}
          data-testid={`location-row-${location._id}`}
          onOpen={() => openLocation(location._id)}
          className={editingId === location._id ? "bg-muted/40" : undefined}
          leading={
            <TreeRowLeading
              depth={depth}
              name={location.name}
              hasChildren={hasChildren}
              expanded={isExpanded}
              onToggle={() => toggleExpanded(location._id)}
            />
          }
          actions={
            <RowMenu label={`More for ${location.name}`}>
              <DropdownMenuItem onSelect={() => openLocation(location._id)}>Open details</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openNew(location._id)}>Add a location inside</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void deleteLocation(location)}>
                Delete…
              </DropdownMenuItem>
            </RowMenu>
          }
        >
          <RowText
            title={location.name}
            detail={
              [
                // A search can surface a deep row on its own; say where it is.
                narrowed && depth > 0 ? location.path : null,
                hasChildren && !isExpanded ? `${plural(descendants, "location")} inside` : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          />
        </ListRow>,
      );
      if (isExpanded) rows.push(...renderRows(node.children, depth + 1));
    }
    return rows;
  }

  return (
    <div className="space-y-4 pb-24" data-testid="storage-locations-page">
      <PageHeader
        title="Storage locations"
        description="Where gear is kept: warehouses and vans, with the rooms, shelves and bins inside them. Items pick their location from here."
        actions={
          <Button type="button" size="sm" onClick={() => openNew()}>
            <PlusIcon />
            New location
          </Button>
        }
        meta={
          locations ? (
            <MetaItem icon={MapPinIcon}>
              {topLevel} top level · {total - topLevel} inside another
            </MetaItem>
          ) : null
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or path…"
        searchLabel="Search storage locations"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      >
        {allParentIds.size ? (
          <Button
            type="button"
            variant="outline"
            className="font-normal"
            onClick={() => setExpandedIds(allExpanded ? new Set() : collectParentIds(tree))}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        ) : null}
      </FilterBar>

      {locations === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <ListSummary
            testId="storage-locations-summary"
            order="A to Z, with the locations inside each one nested under it."
          >
            {plural(total, "location")} · {topLevel} top level · {total - topLevel} inside another
            {narrowed ? ` · ${visibleCount} shown` : ""}
          </ListSummary>

          {tree.length === 0 ? (
            <EmptyState
              action={
                narrowed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setFilters({});
                    }}
                  >
                    Clear search and filters
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => openNew()}>
                    Add a location
                  </Button>
                )
              }
            >
              {narrowed
                ? "No locations match this search and these filters."
                : "No storage locations yet. Add a place gear is kept (a warehouse, a van), then nest its shelves and bins inside it."}
            </EmptyState>
          ) : (
            <ul className="divide-y border [&>li]:border-0" data-testid="storage-locations-list">
              {renderRows(tree, 0)}
            </ul>
          )}
        </>
      )}

      <DetailSheet
        open={panel === "new" || editing !== null}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
        testId="storage-location-sheet"
      >
        <DetailSheetHeader
          title={editing ? editing.name : "New location"}
          description={
            editing
              ? editing.path
              : newParent
                ? `Inside ${newParent.path}`
                : "A place gear is kept, like a warehouse or a van. Add rooms, shelves and bins inside it afterwards."
          }
        />
        {panel === "new" || editing ? (
          <StorageLocationEditor
            key={editing ? editing._id : `new-${newParent?._id ?? ""}`}
            editingId={editing ? editing._id : null}
            initial={{
              name: editing?.name ?? "",
              parentId: (editing ? editing.parentId : newParent?._id) ?? "",
            }}
            locations={locations ?? []}
            onCancel={closePanel}
            onSaved={(name) => {
              notify.success(editing ? `Saved ${name}.` : `Created ${name}.`);
              closePanel();
            }}
            footerStart={
              editing ? (
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => void deleteLocation(editing)}
                  >
                    Delete
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => openNew(editing._id)}>
                    Add a location inside
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : null}
      </DetailSheet>
    </div>
  );
}
