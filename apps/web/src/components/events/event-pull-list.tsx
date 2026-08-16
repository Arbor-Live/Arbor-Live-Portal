"use client";

import { useCallback, useMemo, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { PackageIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InventoryPackageSearchSelect,
  InventoryTypeSearchSelect,
  type InventoryPackageOption,
  type InventoryTypeOption,
} from "@/components/inventory/inventory-search-select";
import { DamageReportWizard } from "@/components/inventory/damage-report-wizard";
import { RentalFulfillmentSheet } from "@/components/events/rental-fulfillment-sheet";
import { useConvexForm } from "@/hooks/use-convex-form";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { pullListFormSchema, type PullListFormValues } from "@/lib/validations/event";

type PackageContent = {
  typeName: string;
  quantity: number;
};

export type PullListItemDraft = {
  id?: Id<"eventPullListItems">;
  lineKind: "type" | "package";
  typeId?: Id<"inventoryTypes">;
  packageId?: Id<"inventoryPackages">;
  label: string;
  typeName?: string;
  packageName?: string;
  packageContents?: PackageContent[];
  typeCategory?: string;
  quantityRequired: number;
  source: "manual" | "invoice_package" | "invoice_type";
  sourcePackageId?: Id<"inventoryPackages">;
  sourceInvoiceLineKey?: string;
  /** Package lines only: BOM types excluded by the source invoice's ala-carte discount. */
  excludedTypeIds?: Id<"inventoryTypes">[];
  sortOrder: number;
  notes: string;
};

export type EnrichedPullListRow = PullListItemDraft & {
  _id: Id<"eventPullListItems">;
};

export function mapPullListRow(
  row: Omit<EnrichedPullListRow, "notes"> & { notes?: string },
): PullListItemDraft {
  const lineKind = row.lineKind ?? (row.packageId ? "package" : "type");
  return {
    id: row._id,
    lineKind,
    typeId: row.typeId,
    packageId: row.packageId,
    label: row.label,
    typeName: lineKind === "type" ? row.typeName : undefined,
    packageName: lineKind === "package" ? row.packageName : undefined,
    packageContents: row.packageContents,
    typeCategory: row.typeCategory,
    quantityRequired: row.quantityRequired,
    source: row.source,
    sourcePackageId: row.sourcePackageId,
    sourceInvoiceLineKey: row.sourceInvoiceLineKey,
    excludedTypeIds: row.excludedTypeIds,
    sortOrder: row.sortOrder,
    notes: row.notes ?? "",
  };
}

type EventPullListProps = {
  eventId: Id<"events"> | undefined;
  eventType: string;
  rentalFulfillmentMode?: "delivery" | "will_call";
  invoiceId?: Id<"invoices">;
  seriesLinked?: boolean;
  initialItems: PullListItemDraft[];
  onSaved?: (message: string) => void;
  onError?: (message: string) => void;
};

const RENTAL_EVENT_TYPES = new Set(["Dry Hire", "Dry Rental", "Rental with Crew"]);

function isRentalEventType(eventType: string) {
  return RENTAL_EVENT_TYPES.has(eventType);
}

function formatQty(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPackageContents(contents: PackageContent[] | undefined, packageQty: number) {
  if (!contents?.length) return null;
  const perPackage = contents.map((row) => `${formatQty(row.quantity)}× ${row.typeName}`).join(", ");
  if (packageQty <= 1) return `Includes: ${perPackage}`;
  return `Each includes: ${perPackage}`;
}

function displayName(item: PullListItemDraft) {
  if (item.lineKind === "package") return item.packageName ?? item.label;
  return item.typeName ?? item.label;
}

function groupCategory(item: PullListItemDraft) {
  if (item.lineKind === "package") return "Packages";
  return item.typeCategory?.trim() || "Other";
}

function clientKeyForItem(item: PullListItemDraft, index: number) {
  return item.id ?? `${item.lineKind}-${item.typeId ?? item.packageId ?? item.label}-${index}`;
}

function toFormValues(items: PullListItemDraft[]): PullListFormValues {
  return {
    items: items.map((item, index) => ({
      clientKey: clientKeyForItem(item, index),
      quantityRequired: item.quantityRequired,
      notes: item.notes,
    })),
  };
}

function mergeFormQuantities(items: PullListItemDraft[], values: PullListFormValues): PullListItemDraft[] {
  const qtyByKey = new Map(values.items.map((row) => [row.clientKey, row.quantityRequired]));
  return items.map((item, index) => {
    const key = clientKeyForItem(item, index);
    const quantityRequired = qtyByKey.get(key) ?? item.quantityRequired;
    return { ...item, quantityRequired: Math.max(1, Math.floor(quantityRequired)) };
  });
}

export function EventPullList({
  eventId,
  eventType,
  rentalFulfillmentMode,
  invoiceId,
  seriesLinked,
  initialItems,
  onSaved,
  onError,
}: EventPullListProps) {
  const { confirm } = useAppDialog();
  const [items, setItems] = useState<PullListItemDraft[]>(initialItems);
  const [addKind, setAddKind] = useState<"type" | "package">("type");
  const [newTypeId, setNewTypeId] = useState("");
  const [newPackageId, setNewPackageId] = useState("");
  const [selectedType, setSelectedType] = useState<InventoryTypeOption | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<InventoryPackageOption | null>(null);
  const [newQty, setNewQty] = useState("1");
  const [showManage, setShowManage] = useState(false);
  const [fulfillmentOpen, setFulfillmentOpen] = useState(false);
  const [fulfillmentDirection, setFulfillmentDirection] = useState<"outbound" | "return">(
    "outbound",
  );
  const [damageOpen, setDamageOpen] = useState(false);

  // Search-on-demand pickers — do not preload inventoryTypes/packages catalogs here.
  const convex = useConvex();
  const upsertItems = useMutation(api.eventPullLists.upsertItems);
  const scaffoldFromInvoice = useMutation(api.eventPullLists.scaffoldFromInvoice);
  const removeItem = useMutation(api.eventPullLists.removeItem);
  const resyncInvoiceFromPullList = useMutation(api.invoices.resyncEquipmentFromPullList);

  const fulfillmentSummary = useQuery(
    api.eventRentalFulfillment.getFulfillmentSummary,
    eventId && isRentalEventType(eventType) ? { eventId } : "skip",
  );
  const showRentalFulfillment = Boolean(eventId && isRentalEventType(eventType));
  const syncStatus = useQuery(
    api.eventPullLists.getInvoiceSyncStatus,
    eventId && !seriesLinked ? { eventId } : "skip",
  );

  const form = useConvexForm<PullListFormValues>({
    schema: pullListFormSchema,
    defaultValues: toFormValues(initialItems),
    mode: "onChange",
  });
  const { reset } = form;

  // The parent remounts this component (via a `key` derived from the same
  // initial-items signature) whenever the persisted pull list changes, so
  // `items`/the form's defaultValues are already fresh on every mount and no
  // resync effect is needed here.

  const totalPieces = useMemo(
    () => items.reduce((sum, item) => sum + item.quantityRequired, 0),
    [items],
  );

  const groupedItems = useMemo(() => {
    const groups = new Map<string, PullListItemDraft[]>();
    for (const item of items) {
      const key = groupCategory(item);
      const bucket = groups.get(key) ?? [];
      bucket.push(item);
      groups.set(key, bucket);
    }
    const order = ["Packages", "Lighting", "Sound", "Design", "Marketing", "Operations", "Other"];
    return [...groups.entries()]
      .sort(([a], [b]) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map(([category, rows]) => ({
        category,
        rows: rows.sort((a, b) => displayName(a).localeCompare(displayName(b))),
      }));
  }, [items]);

  const fulfillmentHelp =
    rentalFulfillmentMode === "will_call"
      ? "Will-call: customer checks out and returns equipment on schedule."
      : rentalFulfillmentMode === "delivery"
        ? "Delivery: drop-off and pickup on schedule."
        : eventType === "Dry Hire"
          ? "Set fulfillment on Overview: Delivery or Will-call."
          : null;

  const persistItems = useCallback(
    async (nextItems: PullListItemDraft[], successMessage: string) => {
      if (!eventId) return;
      const result = await upsertItems({
        eventId,
        items: nextItems.map((item, index) => ({
          id: item.id,
          lineKind: item.lineKind,
          typeId: item.typeId,
          packageId: item.packageId,
          label: item.label,
          quantityRequired: item.quantityRequired,
          quantityPulled: 0,
          quantityCheckedOut: 0,
          source: item.source,
          sourcePackageId: item.sourcePackageId,
          sourceInvoiceLineKey: item.sourceInvoiceLineKey,
          excludedTypeIds: item.excludedTypeIds,
          sortOrder: index,
          notes: item.notes || undefined,
        })),
      });
      setItems(nextItems);
      reset(toFormValues(nextItems));
      onSaved?.(
        `${successMessage} (${result.totalLines} line${result.totalLines === 1 ? "" : "s"}, ${formatQty(result.totalPieces)} piece${result.totalPieces === 1 ? "" : "s"}).`,
      );
    },
    [eventId, onSaved, reset, upsertItems],
  );

  const savePullList = useCallback(
    async (values: PullListFormValues) => {
      const nextItems = mergeFormQuantities(items, values);
      await persistItems(nextItems, "Pull list updated");
      if (eventId && invoiceId && !seriesLinked) {
        const status = await convex.query(api.eventPullLists.getInvoiceSyncStatus, { eventId });
        if (status.hasInvoice && !status.inSync) {
          const shouldResync = await confirm({
            title: "Update the invoice to match?",
            description:
              "This pull list no longer matches the linked invoice's equipment lines.",
            confirmLabel: "Update invoice",
          });
          if (shouldResync) {
            await resyncInvoiceFromPullList({ id: invoiceId, eventId });
            onSaved?.("Pull list updated and invoice equipment lines resynced.");
          }
        }
      }
    },
    [items, persistItems, eventId, invoiceId, seriesLinked, convex, resyncInvoiceFromPullList, onSaved, confirm],
  );

  async function handleScaffold() {
    if (!eventId) return;
    await form.runMutation(async () => {
      const result = await scaffoldFromInvoice({ eventId });
      onSaved?.(
        `Pull list loaded from invoice (${result.insertedCount} line${result.insertedCount === 1 ? "" : "s"}, ${formatQty(result.summary.totalPieces)} piece${result.summary.totalPieces === 1 ? "" : "s"}).`,
      );
    });
  }

  async function addManualLine() {
    const quantityRequired = Math.max(1, Math.floor(Number(newQty) || 1));
    if (addKind === "package") {
      if (!newPackageId || !selectedPackage) return;
      const pkg = selectedPackage;
      const nextItems = [
        ...items,
        {
          lineKind: "package" as const,
          packageId: pkg._id,
          label: pkg.name,
          packageName: pkg.name,
          packageContents: pkg.items.map((row) => ({
            typeName: row.type?.name ?? "Unknown type",
            quantity: row.quantity,
          })),
          typeCategory: "Packages",
          quantityRequired,
          source: "manual" as const,
          sortOrder: items.length,
          notes: "",
        },
      ];
      setNewPackageId("");
      setSelectedPackage(null);
      setNewQty("1");
      await form.runMutation(() => persistItems(nextItems, "Added package to pull list"));
      return;
    }

    if (!newTypeId || !selectedType) return;
    const type = selectedType;
    const nextItems = [
      ...items,
      {
        lineKind: "type" as const,
        typeId: type._id,
        label: type.name,
        typeName: type.name,
        typeCategory: type.category,
        quantityRequired,
        source: "manual" as const,
        sortOrder: items.length,
        notes: "",
      },
    ];
    setNewTypeId("");
    setSelectedType(null);
    setNewQty("1");
    await form.runMutation(() => persistItems(nextItems, "Added to pull list"));
  }

  async function handleRemove(index: number) {
    const item = items[index];
    if (!item) return;
    if (item.id && eventId) {
      await form.runMutation(async () => {
        await removeItem({ id: item.id! });
        const nextItems = items.filter((_, i) => i !== index);
        setItems(nextItems);
        form.reset(toFormValues(nextItems));
        onSaved?.("Removed from pull list.");
      });
      return;
    }
    const nextItems = items.filter((_, i) => i !== index);
    setItems(nextItems);
    form.reset(toFormValues(nextItems));
  }

  function updateQuantityAt(index: number, quantityRequired: number) {
    const qty = Math.max(1, Math.floor(quantityRequired));
    const nextItems = items.map((item, i) => (i === index ? { ...item, quantityRequired: qty } : item));
    setItems(nextItems);
    const nextForm = toFormValues(nextItems);
    form.setValue("items", nextForm.items, { shouldDirty: true });
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">What to pull</h3>
          {items.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {items.length} line{items.length === 1 ? "" : "s"} · {formatQty(totalPieces)} piece
              {totalPieces === 1 ? "" : "s"} total
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Build the pull list from a linked invoice or add items.</p>
          )}
          {fulfillmentHelp ? <p className="mt-1 text-xs text-muted-foreground">{fulfillmentHelp}</p> : null}
          {seriesLinked ? (
            <p className="mt-1 text-xs text-muted-foreground">
              This event is part of a billed series. Invoice lines define billing totals; use the series pull
              list template for per-show quantities. Load from invoice uses per-occurrence qty when series-linked.
            </p>
          ) : null}
          {syncStatus?.hasInvoice && !syncStatus.inSync ? (
            <p className="mt-1 inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-800">
              Out of sync with the linked invoice&apos;s equipment lines.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {showRentalFulfillment ? (
            <>
              <Button
                type="button"
                variant="default"
                disabled={!eventId}
                onClick={() => {
                  setFulfillmentDirection("outbound");
                  setFulfillmentOpen(true);
                }}
              >
                Process delivery
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !eventId ||
                  (!fulfillmentSummary?.outboundCompleted && !fulfillmentSummary?.activeRentedCount)
                }
                onClick={() => {
                  setFulfillmentDirection("return");
                  setFulfillmentOpen(true);
                }}
              >
                Process return
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={!eventId}
            onClick={() => setDamageOpen(true)}
          >
            Report damage
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!eventId || !invoiceId || form.saveStatus === "saving"}
            onClick={() => void handleScaffold().catch((error) => onError?.(getConvexErrorMessage(error)))}
          >
            Load from invoice
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={form.saveStatus === "saving"}
            onClick={() => setShowManage((open) => !open)}
          >
            {showManage ? "Hide editor" : "Edit list"}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No equipment on this pull list yet. Link an invoice on Overview, then use{" "}
            <span className="font-medium text-foreground">Load from invoice</span>.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {groupedItems.map((group, groupIndex) => (
            <section key={group.category}>
              <div className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.category}
              </div>
              <ul className={groupIndex < groupedItems.length - 1 ? "border-b" : undefined}>
                {group.rows.map((item) => {
                  const globalIndex = items.findIndex((row) => row === item);
                  const name = displayName(item);
                  const contentsText = formatPackageContents(item.packageContents, item.quantityRequired);
                  return (
                    <li
                      key={item.id ?? `${item.lineKind}-${item.typeId ?? item.packageId}-${globalIndex}`}
                      className="flex items-start gap-4 border-b px-4 py-3 last:border-b-0"
                    >
                      <div className="flex min-w-[3.5rem] shrink-0 justify-center rounded-md bg-primary/10 px-2 py-1 text-lg font-bold tabular-nums text-primary">
                        {formatQty(item.quantityRequired)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {item.lineKind === "package" ? (
                            <PackageIcon className="size-4 shrink-0 text-muted-foreground" />
                          ) : null}
                          <p className="text-base font-medium leading-tight">{name}</p>
                          {item.lineKind === "package" ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Package
                            </span>
                          ) : null}
                        </div>
                        {contentsText ? (
                          <p className="mt-1 text-xs text-muted-foreground">{contentsText}</p>
                        ) : null}
                        {item.notes ? <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {showManage ? (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <p className="text-sm font-medium">Edit pull list</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={addKind === "type" ? "default" : "outline"}
              onClick={() => setAddKind("type")}
            >
              Add type
            </Button>
            <Button
              type="button"
              size="sm"
              variant={addKind === "package" ? "default" : "outline"}
              onClick={() => setAddKind("package")}
            >
              Add package
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
            <div className="space-y-1">
              <Label>{addKind === "package" ? "Package" : "Inventory type"}</Label>
              {addKind === "package" ? (
                <InventoryPackageSearchSelect
                  value={newPackageId}
                  activeOnly
                  onChange={(id, option) => {
                    setNewPackageId(id);
                    setSelectedPackage(option);
                  }}
                />
              ) : (
                <InventoryTypeSearchSelect
                  value={newTypeId}
                  onChange={(id, option) => {
                    setNewTypeId(id);
                    setSelectedType(option);
                  }}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label>Qty</Label>
              <Input value={newQty} onChange={(e) => setNewQty(e.target.value)} inputMode="numeric" />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                disabled={
                  form.saveStatus === "saving" || (addKind === "package" ? !newPackageId : !newTypeId)
                }
                onClick={() => void addManualLine().catch((error) => onError?.(getConvexErrorMessage(error)))}
              >
                Add
              </Button>
            </div>
          </div>

          {items.length > 0 ? (
            <div className="space-y-2">
              {items.map((item, index) => (
                <div
                  key={item.id ?? `${item.lineKind}-${item.typeId ?? item.packageId}-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {item.lineKind === "package" ? "Package · " : ""}
                    {displayName(item)}
                  </span>
                  <Input
                    className="h-8 w-20"
                    value={String(item.quantityRequired)}
                    onChange={(e) => updateQuantityAt(index, Number(e.target.value) || 1)}
                    inputMode="numeric"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={form.saveStatus === "saving"}
                    onClick={() => void handleRemove(index).catch((error) => onError?.(getConvexErrorMessage(error)))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showManage ? (
        <FormSaveBar
          tier="C"
          saveStatus={form.saveStatus}
          saveError={form.saveError}
          isDirty={form.formState.isDirty}
          saveLabel="Save pull list"
          onSave={() => void form.handleSubmit(savePullList)()}
          onDiscard={() => {
            setItems(initialItems);
            form.reset(toFormValues(initialItems));
          }}
          onRetry={() => void form.handleSubmit(savePullList)()}
        />
      ) : null}

      {eventId ? (
        <>
          {showRentalFulfillment ? (
            <RentalFulfillmentSheet
              open={fulfillmentOpen}
              onOpenChange={setFulfillmentOpen}
              eventId={eventId}
              direction={fulfillmentDirection}
              onMessage={(message) => onSaved?.(message)}
              onError={(message) => onError?.(message)}
            />
          ) : null}
          <DamageReportWizard
            open={damageOpen}
            onOpenChange={setDamageOpen}
            initialEventId={eventId}
            onCreated={() => onSaved?.("Damage report submitted.")}
          />
        </>
      ) : null}
    </div>
  );
}
