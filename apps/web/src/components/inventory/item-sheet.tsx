"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowSquareOutIcon, DotsThreeIcon } from "@phosphor-icons/react";
import { DetailSheet, DetailSheetHeader, SheetField, SheetFields, SheetSection } from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { useSessionViewer } from "@/components/session-shell-provider";
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
import { DAMAGE_STATUS_LABELS, damageStatusTone, OPERABILITY_LABELS } from "@/lib/damage-status";
import { formatDate, formatUsd } from "@/lib/format";
import {
  LIFECYCLE_LABELS,
  lifecycleTone,
  RETIREMENT_REASONS,
  retirementLabel,
  type InventoryLifecycle,
  type RetirementReason,
} from "@/lib/inventory-lifecycle";
import { notify } from "@/lib/notify";
import { inventoryItemLabel } from "./constants";
import { InventoryItemEditor } from "./inventory-item-editor";
import type { LifecycleTarget } from "./item-lifecycle-dialogs";
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

export type ItemSheetActions = {
  onReportDamage: (itemId: Id<"inventoryItems">) => void;
  onRetire: (target: LifecycleTarget) => void;
  onReinstate: (target: LifecycleTarget) => Promise<boolean>;
  onRetag: (target: { _id: Id<"inventoryItems">; assetId: string }) => void;
  /** Resolves true once deleted; false if cancelled or refused. */
  onDelete: (item: { _id: Id<"inventoryItems">; label: string }) => Promise<boolean>;
};

/**
 * One inventory item: its details, what it sits in and what it holds, its
 * damage reports and lifecycle history. Loads by id, so `?item=` links and
 * scan-to-open work for items outside the loaded page. Closes after a save.
 */
export function ItemSheet({
  itemId,
  onOpenChange,
  options,
  siteBase,
  holds,
  actions,
}: {
  itemId: string | null;
  onOpenChange: (open: boolean) => void;
  options: Options;
  siteBase: string;
  /** How many units sit inside the open item. */
  holds: number;
  actions: ItemSheetActions;
}) {
  return (
    <DetailSheet open={itemId !== null} onOpenChange={onOpenChange} testId="item-sheet">
      {itemId ? (
        <ItemSheetBody
          key={itemId}
          itemId={itemId}
          options={options}
          siteBase={siteBase}
          holds={holds}
          onClose={() => onOpenChange(false)}
          actions={actions}
        />
      ) : null}
    </DetailSheet>
  );
}

function ItemSheetBody({
  itemId,
  options,
  siteBase,
  holds,
  onClose,
  actions,
}: {
  itemId: string;
  options: Options;
  siteBase: string;
  holds: number;
  onClose: () => void;
  actions: ItemSheetActions;
}) {
  const item = useQuery(api.inventoryItems.get, { id: itemId });
  const setInRepair = useMutation(api.inventoryLifecycle.setInRepair);
  const viewer = useSessionViewer();
  const canManage = Boolean(viewer?.isAdmin || viewer?.verticals?.includes("Operations"));

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
  const lifecycle = item.lifecycle;
  const retired = lifecycle === "retired";
  const target: LifecycleTarget = { _id: item._id, label, holds };
  const assetId = item.assetId;

  async function toggleRepair(inRepair: boolean) {
    try {
      await setInRepair({ id: item!._id, inRepair });
      notify.success(inRepair ? `${label} is in repair.` : `${label} is back in service.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not update the item."));
    }
  }

  return (
    <>
      <DetailSheetHeader
        title={label}
        pill={<LifecyclePill lifecycle={lifecycle} reason={item.retirement?.reason} />}
        description={[
          formatTypeDisplay(item.type ?? { name: "Unknown type", model: "Unknown type" }),
          item.location?.path ?? "No location",
          item.containedInAsset ? `inside ${inventoryItemLabel(item.containedInAsset)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      {item.retirement ? (
        <SheetSection title="Retired">
          <SheetFields>
            <SheetField label="Reason">{retirementLabel(item.retirement.reason)}</SheetField>
            <SheetField label="Since">{formatDate(item.retirement.retiredAt)}</SheetField>
            {item.retirement.counterparty ? (
              <SheetField label={RETIREMENT_REASONS[item.retirement.reason].counterpartyLabel ?? "With"}>
                {item.retirement.counterparty}
              </SheetField>
            ) : null}
            {item.retirement.amountUsd !== undefined ? (
              <SheetField label="Sold for">{formatUsd(item.retirement.amountUsd)}</SheetField>
            ) : null}
            {item.replacementItem ? (
              <SheetField label={RETIREMENT_REASONS[item.retirement.reason].replacementLabel ?? "Replaced by"}>
                <Link className="underline" href={`/dashboard/inventory/items?item=${item.replacementItem._id}`}>
                  {inventoryItemLabel(item.replacementItem)}
                </Link>
              </SheetField>
            ) : null}
            {item.retirement.damageReportId ? (
              <SheetField label="Damage report">
                <Link
                  className="underline"
                  href={`/dashboard/inventory/damage?report=${item.retirement.damageReportId}`}
                >
                  Open the report
                </Link>
              </SheetField>
            ) : null}
            {item.retirement.notes ? <SheetField label="Note">{item.retirement.notes}</SheetField> : null}
          </SheetFields>
        </SheetSection>
      ) : null}
      {/* Above the form: what's happened to the unit is the first thing to see. */}
      <ItemDamageSection
        itemId={item._id}
        openCount={item.openDamageCount ?? 0}
        onReport={retired ? undefined : () => actions.onReportDamage(item._id)}
      />
      <ItemHistorySection itemId={item._id} previousAssetIds={item.previousAssetIds} />
      <InventoryItemEditor
        editingId={item._id}
        initial={{
          assetId: item.assetId ?? "",
          serialNumber: item.serialNumber ?? "",
          typeId: item.typeId,
          storageLocationId: item.storageLocationId ?? "",
          containedInAssetId: item.containedInAssetId ?? "",
          condition: item.condition ?? "",
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
            {retired ? (
              canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void actions.onReinstate(target)}
                >
                  Reinstate
                </Button>
              ) : null
            ) : canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => actions.onRetire(target)}
              >
                Retire…
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${label}`}>
                  <DotsThreeIcon weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {canManage && assetId ? (
                  <DropdownMenuItem onSelect={() => actions.onRetag({ _id: item._id, assetId })}>
                    Replace tag…
                  </DropdownMenuItem>
                ) : null}
                {canManage && lifecycle === "active" ? (
                  <DropdownMenuItem onSelect={() => void toggleRepair(true)}>Mark in repair</DropdownMenuItem>
                ) : null}
                {canManage && lifecycle === "in_repair" ? (
                  <DropdownMenuItem onSelect={() => void toggleRepair(false)}>Back in service</DropdownMenuItem>
                ) : null}
                {assetId ? (
                  <DropdownMenuItem asChild>
                    <a href={`${siteBase}/e/${encodeURIComponent(assetId)}`} target="_blank" rel="noreferrer">
                      Open public page
                      <ArrowSquareOutIcon className="ml-auto size-3" aria-hidden />
                    </a>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={async () => {
                    if (await actions.onDelete({ _id: item._id, label })) onClose();
                  }}
                >
                  Delete item
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />
    </>
  );
}

export function LifecyclePill({
  lifecycle,
  reason,
}: {
  lifecycle: InventoryLifecycle;
  reason?: RetirementReason;
}) {
  return (
    <StatusPill tone={lifecycleTone(lifecycle)} className="h-6">
      {lifecycle === "retired" ? `Retired · ${retirementLabel(reason)}` : LIFECYCLE_LABELS[lifecycle]}
    </StatusPill>
  );
}

/** Every report filed on this unit, so its damage is visible from the item itself. */
function ItemDamageSection({
  itemId,
  openCount,
  onReport,
}: {
  itemId: Id<"inventoryItems">;
  openCount: number;
  /** Absent for retired units, which can't take new reports. */
  onReport?: () => void;
}) {
  const reports = useQuery(api.damageReports.listForItem, { inventoryItemId: itemId });
  return (
    <SheetSection
      title={openCount ? `Damage (${openCount} open)` : "Damage"}
      action={
        onReport ? (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onReport}>
            Report damage
          </Button>
        ) : undefined
      }
    >
      {reports === undefined ? (
        <Skeleton className="h-12 w-full" />
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">No damage reported.</p>
      ) : (
        <ul className="divide-y border text-sm" data-testid="item-damage-list">
          {reports.map((report) => (
            <li key={report._id}>
              <Link
                href={`/dashboard/inventory/damage?report=${report._id}`}
                className="flex items-start gap-3 px-3 py-2 hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    Severity {report.severity} of 5 · {OPERABILITY_LABELS[report.operability]}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[formatDate(report.reportedAt), report.reportedByName, report.eventTitle, report.notes]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <StatusPill tone={damageStatusTone(report.status)} className="h-6 shrink-0">
                  {DAMAGE_STATUS_LABELS[report.status]}
                </StatusPill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SheetSection>
  );
}

const HISTORY_TITLES = {
  retired: "Retired",
  reinstated: "Reinstated",
  retagged: "Tag replaced",
  repair_started: "Into repair",
  repair_finished: "Back in service",
} as const;

/** Lifecycle changes and old tags. Empty for a unit that's never changed state. */
function ItemHistorySection({
  itemId,
  previousAssetIds,
}: {
  itemId: Id<"inventoryItems">;
  previousAssetIds: string[];
}) {
  const history = useQuery(api.inventoryLifecycle.listHistory, { id: itemId });
  if (history === undefined || (history.length === 0 && previousAssetIds.length === 0)) return null;
  return (
    <SheetSection title="History">
      {previousAssetIds.length ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Old tags, still scannable: </span>
          {previousAssetIds.join(", ")}
        </p>
      ) : null}
      {history.length ? (
        <ol className="space-y-2 text-sm" data-testid="item-history">
          {history.map((entry) => (
            <li key={entry._id} className="border-l-2 pl-3">
              <p className="font-medium">
                {HISTORY_TITLES[entry.kind]}
                {entry.kind === "retired" || (entry.kind === "reinstated" && entry.reason)
                  ? ` · ${retirementLabel(entry.reason)}`
                  : null}
                {entry.kind === "retagged" ? ` · ${entry.fromAssetId} → ${entry.toAssetId}` : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {[formatDate(entry.at), entry.actorName, entry.notes].filter(Boolean).join(" · ")}
                {entry.damageReportId ? (
                  <>
                    {" · "}
                    <Link className="underline" href={`/dashboard/inventory/damage?report=${entry.damageReportId}`}>
                      damage report
                    </Link>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </SheetSection>
  );
}
