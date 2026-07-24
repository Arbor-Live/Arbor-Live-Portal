"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { DamageReportWizard } from "./damage-report-wizard";
import { InventoryItemEditor } from "./inventory-item-editor";
import { toCategoryOptions } from "./constants";

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

export function ItemsManager() {
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState<"assetId" | "category" | "location">("assetId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorInitial, setEditorInitial] = useState(defaultForm);
  const [damageItemId, setDamageItemId] = useState<string | null>(null);
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
  const types = useQuery(api.inventoryTypes.list, {});
  const locations = useQuery(api.storageLocations.list, {});
  const removeItem = useMutation(api.inventoryItems.remove);
  const sortedItems = useMemo(() => {
    const rows = [...items];
    rows.sort((a, b) => {
      const direction = sortDir === "asc" ? 1 : -1;
      if (sortBy === "category") {
        return (a.type?.category ?? "").localeCompare(b.type?.category ?? "") * direction;
      }
      if (sortBy === "location") {
        return (a.location?.path ?? "").localeCompare(b.location?.path ?? "") * direction;
      }
      return a.assetId.localeCompare(b.assetId) * direction;
    });
    return rows;
  }, [items, sortBy, sortDir]);
  const itemLookup = useMemo(() => {
    const map = new Map<
      string,
      { assetId: string; name: string; category: string }
    >();
    for (const item of sortedItems) {
      map.set(item._id, {
        assetId: item.assetId,
        name: `${item.type?.name ?? "Unknown"} ${item.type?.model ?? ""}`.trim(),
        category: item.type?.category ?? "unknown",
      });
    }
    for (const item of itemSummaries ?? []) {
      if (map.has(item._id)) continue;
      map.set(item._id, {
        assetId: item.assetId,
        name: `${item.type?.name ?? "Unknown"} ${item.type?.model ?? ""}`.trim(),
        category: item.type?.category ?? "unknown",
      });
    }
    return map;
  }, [itemSummaries, sortedItems]);

  async function bulkDeleteSelected() {
    try {
      await Promise.all(selectedIds.map((id) => removeItem({ id: id as never })));
      setSelectedIds([]);
    } catch (error) {
      window.alert(getConvexErrorMessage(error, "Could not delete selected items."));
    }
  }

  function scrollToItemRow(itemId: string) {
    const row = rowRefs.current.get(itemId);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("bg-muted/70");
    window.setTimeout(() => row.classList.remove("bg-muted/70"), 1200);
  }

  function renderItemChip(itemId: string, fallbackAssetId?: string) {
    const details = itemLookup.get(itemId);
    const assetLabel = details?.assetId ?? fallbackAssetId ?? "Unknown";
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

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Inventory Items</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search by asset ID, serial, model"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All Categories</option>
              {toCategoryOptions(categories).map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            >
              <option value="assetId">Sort: Asset ID</option>
              <option value="category">Sort: Category</option>
              <option value="location">Sort: Location</option>
            </select>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={sortDir}
              onChange={(event) => setSortDir(event.target.value as typeof sortDir)}
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
            <Button
              type="button"
              variant="destructive"
              disabled={!selectedIds.length}
              onClick={() => void bulkDeleteSelected()}
            >
              Delete Selected ({selectedIds.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">
                    <input
                      type="checkbox"
                      checked={sortedItems.length > 0 && selectedIds.length === sortedItems.length}
                      onChange={(event) =>
                        setSelectedIds(event.target.checked ? sortedItems.map((item) => item._id) : [])
                      }
                    />
                  </th>
                  <th className="p-2 text-left">Asset</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Location</th>
                  <th className="p-2 text-left">Container</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr
                    key={item._id}
                    className="border-t align-top transition-colors"
                    ref={(element) => {
                      if (!element) {
                        rowRefs.current.delete(item._id);
                        return;
                      }
                      rowRefs.current.set(item._id, element);
                    }}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item._id)}
                        onChange={(event) =>
                          setSelectedIds((prev) =>
                            event.target.checked
                              ? [...prev, item._id]
                              : prev.filter((id) => id !== item._id),
                          )
                        }
                      />
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{item.assetId}</div>
                      <div className="text-xs text-muted-foreground">Serial: {item.serialNumber || "-"}</div>
                      <div className="mt-1 text-xs">
                        <a
                          className="underline"
                          href={`${siteBase}/e/${encodeURIComponent(item.assetId)}`}
                          target="_blank"
                        >
                          Public /e link
                        </a>
                      </div>
                    </td>
                    <td className="p-2">
                      {formatTypeDisplay(item.type)}
                      <div className="text-xs text-muted-foreground">{item.type?.category}</div>
                    </td>
                    <td className="p-2">{item.location?.path || "-"}</td>
                    <td className="p-2">
                      <div>
                        In:{" "}
                        {item.containedInAsset
                          ? renderItemChip(item.containedInAsset._id, item.containedInAsset.assetId)
                          : "-"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Contains: {item.containedAssets?.length ?? 0}
                      </div>
                      {item.containedAssets?.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.containedAssets.map((child) => (
                            <span key={child._id}>
                              {renderItemChip(child._id, child.assetId)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(item._id);
                            setEditorInitial({
                              assetId: item.assetId,
                              serialNumber: item.serialNumber ?? "",
                              typeId: item.typeId,
                              storageLocationId: item.storageLocationId ?? "",
                              containedInAssetId: item.containedInAssetId ?? "",
                              status: item.status ?? "",
                              notes: item.notes ?? "",
                            });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDamageItemId(item._id)}
                        >
                          Damage
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void removeItem({ id: item._id })}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      <InventoryItemEditor
        editingId={editingId as never}
        initial={editorInitial}
        types={types ?? []}
        locations={locations ?? []}
        items={(itemSummaries ?? []).map((item) => ({
          _id: item._id,
          assetId: item.assetId,
          typeId: item.typeId,
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

      <DamageReportWizard
        open={Boolean(damageItemId)}
        onOpenChange={(open) => {
          if (!open) setDamageItemId(null);
        }}
        initialInventoryItemId={damageItemId as never}
      />
    </div>
  );
}
