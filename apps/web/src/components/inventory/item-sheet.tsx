"use client";

import { useQuery } from "convex/react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { DetailSheet, DetailSheetHeader } from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Id } from "@/lib/convex-api";
import { inventoryItemLabel } from "./constants";
import { InventoryItemEditor } from "./inventory-item-editor";
import { formatTypeDisplay } from "./package-section-utils";

type Options = {
  types: Array<{ _id: Id<"inventoryTypes">; name: string; model: string }>;
  locations: Array<{ _id: Id<"storageLocations">; path: string }>;
  items: Array<{
    _id: Id<"inventoryItems">;
    assetId?: string;
    serialNumber?: string;
    type?: { name: string; model: string; manufacturer?: string } | null;
  }>;
};

/**
 * One inventory item: its details, what it sits in and what it holds. Loads
 * by id, so `?item=` links and scan-to-open work for items outside the loaded
 * page. Closes after a save.
 */
export function ItemSheet({
  itemId,
  onOpenChange,
  options,
  siteBase,
  onReportDamage,
  onDelete,
}: {
  itemId: string | null;
  onOpenChange: (open: boolean) => void;
  options: Options;
  siteBase: string;
  onReportDamage: (itemId: Id<"inventoryItems">) => void;
  /** Resolves true once deleted; false if cancelled or refused. */
  onDelete: (item: { _id: Id<"inventoryItems">; label: string }) => Promise<boolean>;
}) {
  return (
    <DetailSheet open={itemId !== null} onOpenChange={onOpenChange} testId="item-sheet">
      {itemId ? (
        <ItemSheetBody
          key={itemId}
          itemId={itemId}
          options={options}
          siteBase={siteBase}
          onClose={() => onOpenChange(false)}
          onReportDamage={onReportDamage}
          onDelete={onDelete}
        />
      ) : null}
    </DetailSheet>
  );
}

function ItemSheetBody({
  itemId,
  options,
  siteBase,
  onClose,
  onReportDamage,
  onDelete,
}: {
  itemId: string;
  options: Options;
  siteBase: string;
  onClose: () => void;
  onReportDamage: (itemId: Id<"inventoryItems">) => void;
  onDelete: (item: { _id: Id<"inventoryItems">; label: string }) => Promise<boolean>;
}) {
  const item = useQuery(api.inventoryItems.get, { id: itemId });

  if (item === undefined) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (item === null) {
    return <p className="p-4 text-sm text-muted-foreground">This item no longer exists.</p>;
  }

  const label = inventoryItemLabel(item);

  return (
    <>
      <DetailSheetHeader
        title={label}
        pill={item.status ? <StatusPill tone="neutral" className="h-6">{item.status}</StatusPill> : null}
        description={[
          formatTypeDisplay(item.type ?? { name: "Unknown type", model: "Unknown type" }),
          item.location?.path ?? "No location",
          item.containedInAsset ? `inside ${inventoryItemLabel(item.containedInAsset)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <InventoryItemEditor
        editingId={item._id}
        initial={{
          assetId: item.assetId ?? "",
          serialNumber: item.serialNumber ?? "",
          typeId: item.typeId,
          storageLocationId: item.storageLocationId ?? "",
          containedInAssetId: item.containedInAssetId ?? "",
          status: item.status ?? "",
          notes: item.notes ?? "",
        }}
        types={options.types}
        locations={options.locations}
        items={options.items}
        siteBase={siteBase}
        onCancel={onClose}
        onSaved={onClose}
        footerStart={
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={async () => {
                if (await onDelete({ _id: item._id, label })) onClose();
              }}
            >
              Delete
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onReportDamage(item._id)}>
              Report damage
            </Button>
            {item.assetId ? (
              <Button asChild variant="ghost" size="sm">
                <a href={`${siteBase}/e/${encodeURIComponent(item.assetId)}`} target="_blank" rel="noreferrer">
                  Public page
                  <ArrowSquareOutIcon className="size-3" aria-hidden />
                </a>
              </Button>
            ) : null}
          </div>
        }
      />
    </>
  );
}
