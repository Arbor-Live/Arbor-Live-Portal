"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
import {
  CameraIcon,
  CaretDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { type DataTableFeatures } from "@/components/ui/data-table-features";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { AssetScanner } from "./asset-scanner";
import { CreateAssetWizard } from "./create-asset-wizard";
import { DamageReportWizard } from "./damage-report-wizard";
import { InventoryItemEditor } from "./inventory-item-editor";
import { inventoryItemLabel, toCategoryOptions } from "./constants";
import { cn } from "@/lib/utils";

const defaultForm = {
  assetId: "",
  serialNumber: "",
  typeId: "",
  storageLocationId: "",
  containedInAssetId: "",
  status: "",
  notes: "",
};

function formatTypeDisplay(type: { manufacturer?: string; name: string; model: string } | null | undefined) {
  if (!type) return "Unknown type";
  const maker = type.manufacturer?.trim();
  const sameNameModel = type.name.trim().toLowerCase() === type.model.trim().toLowerCase();
  const core = sameNameModel ? type.name : `${type.name} / ${type.model}`;
  return maker ? `${maker} ${core}` : core;
}

type InventoryItemRow = FunctionReturnType<typeof api.inventoryItems.list>["page"][number];

const columnHelper = createColumnHelper<DataTableFeatures, InventoryItemRow>();

export function ItemsManager() {
  const { alert } = useAppDialog();
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorInitial, setEditorInitial] = useState(defaultForm);
  const [damageItemId, setDamageItemId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanRaw, setScanRaw] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const categories = useQuery(api.inventoryCategories.list, { activeOnly: true });
  const {
    results: items,
    status: itemsStatus,
    loadMore,
  } = usePaginatedQuery(
    api.inventoryItems.list,
    {
      search: search || undefined,
      category: category || undefined,
    },
    { initialNumItems: 100 },
  );
  const itemSummaries = useQuery(api.inventoryItems.listSummaries, {});
  const types = useQuery(api.inventoryTypes.listOptions, {});
  const locations = useQuery(api.storageLocations.list, {});
  const removeItem = useMutation(api.inventoryItems.remove);
  const scanResolved = useQuery(
    api.inventoryItems.resolveByScan,
    scanRaw.trim() ? { raw: scanRaw } : "skip",
  );

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );

  const itemLookup = useMemo(() => {
    const map = new Map<
      string,
      { assetId: string; name: string; category: string }
    >();
    for (const item of items) {
      map.set(item._id, {
        assetId: inventoryItemLabel(item),
        name: `${item.type?.name ?? "Unknown"} ${item.type?.model ?? ""}`.trim(),
        category: item.type?.category ?? "unknown",
      });
    }
    for (const item of itemSummaries ?? []) {
      if (map.has(item._id)) continue;
      map.set(item._id, {
        assetId: inventoryItemLabel(item),
        name: `${item.type?.name ?? "Unknown"} ${item.type?.model ?? ""}`.trim(),
        category: item.type?.category ?? "unknown",
      });
    }
    return map;
  }, [itemSummaries, items]);

  /** Children by parent — from summaries so list query skips per-row child scans. */
  const childrenByParentId = useMemo(() => {
    const map = new Map<string, Array<{ _id: string; assetId?: string; serialNumber?: string }>>();
    for (const item of itemSummaries ?? []) {
      if (!item.containedInAssetId) continue;
      const list = map.get(item.containedInAssetId) ?? [];
      list.push({ _id: item._id, assetId: item.assetId, serialNumber: item.serialNumber });
      map.set(item.containedInAssetId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) =>
        (a.assetId ?? a.serialNumber ?? "").localeCompare(b.assetId ?? b.serialNumber ?? ""),
      );
    }
    return map;
  }, [itemSummaries]);

  const categoryLabel = useMemo(() => {
    if (!category) return "All Categories";
    return toCategoryOptions(categories).find((entry) => entry.value === category)?.label ?? category;
  }, [categories, category]);

  async function bulkDeleteSelected() {
    try {
      await Promise.all(selectedIds.map((id) => removeItem({ id: id as never })));
      setRowSelection({});
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Could not delete selected items."));
    }
  }

  function scrollToItemRow(itemId: string) {
    const row = rowRefs.current.get(itemId);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("bg-muted/70");
    window.setTimeout(() => row.classList.remove("bg-muted/70"), 1200);
  }

  function beginEdit(item: InventoryItemRow) {
    setEditingId(item._id);
    setEditorInitial({
      assetId: item.assetId ?? "",
      serialNumber: item.serialNumber ?? "",
      typeId: item.typeId,
      storageLocationId: item.storageLocationId ?? "",
      containedInAssetId: item.containedInAssetId ?? "",
      status: item.status ?? "",
      notes: item.notes ?? "",
    });
  }

  /** Scan-to-select: resolve, focus the row, add to the selection. */
  useEffect(() => {
    if (!scanRaw.trim()) return;
    if (scanResolved === undefined) return;
    if (scanResolved === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- consume the one-shot scan-to-select resolution
      setScanError(`No item found for “${scanRaw.trim()}”.`);
      setScanRaw("");
      setScanOpen(false);
      return;
    }
    setScanError(null);
    setSearch(scanResolved.assetId);
    setCategory("");
    setPendingSelectId(scanResolved._id);
    setScanRaw("");
    setScanOpen(false);
  }, [scanResolved, scanRaw]);

  useEffect(() => {
    if (!pendingSelectId) return;
    const row = rowRefs.current.get(pendingSelectId);
    if (row) {
      scrollToItemRow(pendingSelectId);
      setRowSelection((prev) => ({ ...prev, [pendingSelectId]: true }));
      setPendingSelectId(null);
    }
  }, [items, pendingSelectId]);

  function renderItemChip(itemId: string, fallbackAssetId?: string) {
    const details = itemLookup.get(itemId);
    const assetLabel = details?.assetId ?? fallbackAssetId ?? "No ID";
    return (
      <button
        type="button"
        className="group relative rounded border px-1.5 py-0.5 text-xs hover:bg-muted"
        onClick={() => scrollToItemRow(itemId)}
      >
        {assetLabel}
        <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-56 rounded-md border bg-popover p-2 text-left text-xs text-popover-foreground shadow-md group-hover:block">
          <p className="font-medium">{assetLabel}</p>
          <p className="text-muted-foreground">{details?.name ?? "Item details unavailable"}</p>
          <p className="text-muted-foreground capitalize">{details?.category ?? "unknown"}</p>
        </div>
      </button>
    );
  }

  const columns = columnHelper.columns([
    columnHelper.display({
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
    columnHelper.accessor((row) => row.assetId ?? row.serialNumber ?? "", {
      id: "assetId",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Asset" />,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div>
            <div className="font-medium">{item.assetId ?? "No ID"}</div>
            <div className="text-xs text-muted-foreground">Serial: {item.serialNumber || "-"}</div>
            {item.assetId ? (
              <div className="mt-1 text-xs">
                <a
                  className="underline"
                  href={`${siteBase}/e/${encodeURIComponent(item.assetId)}`}
                  target="_blank"
                >
                  Public /e link
                </a>
              </div>
            ) : null}
          </div>
        );
      },
    }),
    columnHelper.accessor((row) => row.type?.category ?? "", {
      id: "category",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => (
        <div>
          {formatTypeDisplay(row.original.type)}
          <div className="text-xs text-muted-foreground">{row.original.type?.category}</div>
        </div>
      ),
    }),
    columnHelper.accessor((row) => row.location?.path ?? "", {
      id: "location",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
      cell: ({ getValue }) => getValue() || "-",
    }),
    columnHelper.display({
      id: "container",
      enableSorting: false,
      header: "Container",
      cell: ({ row }) => {
        const item = row.original;
        const children = childrenByParentId.get(item._id) ?? [];
        return (
          <div>
            <div>
              In:{" "}
              {item.containedInAsset
                ? renderItemChip(item.containedInAsset._id, item.containedInAsset.assetId)
                : "-"}
            </div>
            <div className="text-xs text-muted-foreground">Contains: {children.length}</div>
            {children.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {children.map((child) => (
                  <span key={child._id}>{renderItemChip(child._id, child.assetId)}</span>
                ))}
              </div>
            ) : null}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      enableHiding: false,
      enableSorting: false,
      header: "Actions",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Edit"
                  onClick={() => beginEdit(item)}
                >
                  <PencilSimpleIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Damage"
                  onClick={() => setDamageItemId(item._id)}
                >
                  <WarningCircleIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Report damage</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="destructive"
                  aria-label="Delete"
                  onClick={() => void removeItem({ id: item._id })}
                >
                  <TrashIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        );
      },
    }),
  ]);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Inventory Items</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1">
                <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by asset ID, serial, model"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setScanOpen((prev) => !prev)}
              >
                <CameraIcon className="size-4" />
                Scan
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="gap-1.5">
                    {categoryLabel}
                    <CaretDownIcon className="size-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80">
                  <DropdownMenuItem
                    onClick={() => setCategory("")}
                    className={cn(!category && "bg-accent")}
                  >
                    {category === "" ? <CheckIcon className="size-3.5" /> : <span className="size-3.5" />}
                    All Categories
                  </DropdownMenuItem>
                  {toCategoryOptions(categories).map((entry) => (
                    <DropdownMenuItem
                      key={entry.value}
                      onClick={() => setCategory(entry.value)}
                      className={cn(category === entry.value && "bg-accent")}
                    >
                      {category === entry.value ? (
                        <CheckIcon className="size-3.5" />
                      ) : (
                        <span className="size-3.5" />
                      )}
                      {entry.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" onClick={() => setWizardOpen(true)}>
                <PlusIcon className="size-4" />
                New Item
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!selectedIds.length}
                    aria-label="Delete selected items"
                    onClick={() => void bulkDeleteSelected()}
                  >
                    <TrashIcon className="size-4" />
                    {selectedIds.length ? ` (${selectedIds.length})` : ""}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete selected items</TooltipContent>
              </Tooltip>
            </div>
            {scanOpen ? (
              <div className="rounded-md border bg-muted/30 p-3">
                <AssetScanner onSubmit={(raw) => setScanRaw(raw)} autoFocus />
                {scanError ? <p className="text-sm text-destructive">{scanError}</p> : null}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <DataTable
              columns={columns}
              data={items}
              getRowId={(row) => row._id}
              enableRowSelection
              enableColumnVisibility
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              initialSorting={[{ id: "assetId", desc: false }]}
              emptyMessage="No inventory items found."
              getRowProps={(row) => ({
                "data-testid": `item-row-${row.original._id}`,
                ref: (element: HTMLTableRowElement | null) => {
                  if (!element) {
                    rowRefs.current.delete(row.original._id);
                    return;
                  }
                  rowRefs.current.set(row.original._id, element);
                },
              })}
            />
            {itemsStatus === "CanLoadMore" || itemsStatus === "LoadingMore" ? (
              <Button
                type="button"
                variant="outline"
                disabled={itemsStatus === "LoadingMore"}
                onClick={() => loadMore(100)}
              >
                {itemsStatus === "LoadingMore" ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {editingId ? (
          <InventoryItemEditor
            editingId={editingId as never}
            initial={editorInitial}
            types={types ?? []}
            locations={locations ?? []}
            items={(itemSummaries ?? []).map((item) => ({
              _id: item._id,
              assetId: item.assetId,
              serialNumber: item.serialNumber,
              type: item.type ?? undefined,
            }))}
            siteBase={siteBase}
            onCancel={() => {
              setEditingId(null);
              setEditorInitial(defaultForm);
            }}
            onSaved={() => {
              if (!editingId) setEditorInitial(defaultForm);
            }}
          />
        ) : null}

        <DamageReportWizard
          open={Boolean(damageItemId)}
          onOpenChange={(open) => {
            if (!open) setDamageItemId(null);
          }}
          initialInventoryItemId={damageItemId as never}
        />

        <CreateAssetWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      </div>
    </TooltipProvider>
  );
}
