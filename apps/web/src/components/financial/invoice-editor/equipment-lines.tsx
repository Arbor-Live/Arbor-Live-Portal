"use client";

import { useState } from "react";
import { ArrowsClockwiseIcon, PackageIcon } from "@phosphor-icons/react";
import {
  InventoryPackageSearchSelect,
  InventoryTypeSearchSelect,
} from "@/components/inventory/inventory-search-select";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { computePackageExclusionSuggestedDiscount } from "@/lib/compute-invoice-draft-totals";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { EquipmentBasis, EquipmentPricingModeValue, EquipmentRow } from "./invoice-draft-model";
import {
  AmountCell,
  LineColumnHeads,
  LineGroup,
  LineRow,
  StaticCell,
  patchRow,
  plural,
  removeRow,
} from "./line-items-layout";
import type { InvoiceDraft } from "./use-invoice-draft";

type PackageOption = NonNullable<ReturnType<InvoiceDraft["packageById"]["get"]>>;
type TypeOption = NonNullable<ReturnType<InvoiceDraft["typeById"]["get"]>>;

function packageRate(pkg: PackageOption | undefined, mode: EquipmentPricingModeValue) {
  return mode === "subsidized"
    ? (pkg?.subsidizedPackagePriceUsd ?? pkg?.nonSubsidizedPackagePriceUsd ?? (pkg?.packagePriceCents ?? 0) / 100)
    : (pkg?.nonSubsidizedPackagePriceUsd ?? (pkg?.packagePriceCents ?? 0) / 100);
}

function typeRate(type: TypeOption | undefined, mode: EquipmentPricingModeValue) {
  return mode === "subsidized"
    ? (type?.subsidizedRentalPriceUsd ?? type?.nonSubsidizedRentalPriceUsd ?? type?.rentalPriceUsd ?? 0)
    : (type?.nonSubsidizedRentalPriceUsd ?? type?.rentalPriceUsd ?? 0);
}

/** Billed quantity and the hint under the amount ("2×3", "~1/show"). */
function billing(row: EquipmentRow, billableOccurrenceCount: number) {
  const qty = Number(row.quantity || "0");
  const basis = row.basis ?? "total";
  const perOccurrence = basis === "per_occurrence" && billableOccurrenceCount > 0;
  return {
    billedQty: perOccurrence ? qty * billableOccurrenceCount : qty,
    hint: perOccurrence
      ? `${qty} × ${plural(billableOccurrenceCount, "show")}`
      : basis === "total" && billableOccurrenceCount > 1
        ? `~${Math.floor(qty / billableOccurrenceCount)}/show`
        : undefined,
  };
}

function BasisToggle({
  id,
  value,
  onChange,
}: {
  id: string;
  value: EquipmentBasis;
  onChange: (basis: EquipmentBasis) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={id} className="text-xs text-muted-foreground">
        Quantity is
      </span>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        aria-labelledby={id}
        value={value}
        onValueChange={(next) => next && onChange(next as EquipmentBasis)}
      >
        <ToggleGroupItem value="total">Total</ToggleGroupItem>
        <ToggleGroupItem value="per_occurrence">Per occurrence</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

/** Packages and individual asset types, priced from the catalog by the quote's pricing mode. */
export function EquipmentLines({ draft }: { draft: InvoiceDraft }) {
  const { confirm } = useAppDialog();
  const [syncingPullList, setSyncingPullList] = useState(false);
  const { lines, setSection, packageById, typeById, billableOccurrenceCount, pullListSyncStatus } = draft;
  const mode = draft.fields.equipmentPricingMode;
  const packages = lines.equipmentPackages;
  const types = lines.equipmentTypes;
  if (packages.length === 0 && types.length === 0) return null;

  const pullListOutOfSync = Boolean(pullListSyncStatus?.hasInvoice && pullListSyncStatus.inSync === false);

  async function handleSyncPullList() {
    if (!draft.linkedEvent || syncingPullList) return;
    const shouldSync = await confirm({
      title: "Update the pull list?",
      description: draft.isDraftDirty
        ? "Save this quote, then update the pull list to match its equipment lines?"
        : "Update the pull list to match this invoice's equipment lines?",
    });
    if (!shouldSync) return;

    setSyncingPullList(true);
    try {
      // Pull-list scaffolding reads committed invoice lines. Persist unsaved
      // equipment edits first or the sync silently matches stale DB state and
      // Save will immediately ask again.
      if (draft.isDraftDirty) {
        const saved = await draft.persistDraft(false);
        if (!saved) {
          notify.error("Save the quote before syncing the pull list.");
          return;
        }
      }
      await draft.scaffoldPullListsForLinkedDays();
      notify.success("Pull list resynced from invoice.");
      draft.setSaveError(null);
    } catch (error) {
      const message = getConvexErrorMessage(error, "Could not sync the pull list.");
      notify.error(message);
      draft.setSaveError(message);
    } finally {
      setSyncingPullList(false);
    }
  }

  return (
    <LineGroup
      icon={PackageIcon}
      title="Equipment"
      detail={plural(packages.length + types.length, "line")}
      subtotalUsd={draft.draftTotals.equipmentSubtotalUsd}
      subtotalTestId="invoice-total-equipment"
      testId="invoice-group-equipment"
      actions={
        pullListOutOfSync ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={syncingPullList}
            onClick={() => void handleSyncPullList()}
            title="The event's pull list no longer matches these lines"
          >
            <ArrowsClockwiseIcon />
            {syncingPullList ? "Syncing…" : "Sync pull list"}
          </Button>
        ) : null
      }
    >
      <LineColumnHeads />
      {packages.map((row, idx) => {
        const pkg = packageById.get(row.refId);
        const originalRate = packageRate(pkg, mode);
        const excluded = new Set(row.excludedTypeIds ?? []);
        const suggestedDiscount = computePackageExclusionSuggestedDiscount(pkg?.items, row.excludedTypeIds, mode);
        const discountOverride = row.discountUsd?.trim();
        const discount =
          discountOverride !== undefined && discountOverride !== "" ? Number(discountOverride) : suggestedDiscount;
        const rate = Math.max(0, originalRate - (Number.isFinite(discount) ? discount : 0));
        const { billedQty, hint } = billing(row, billableOccurrenceCount);
        const setRows = (updater: (rows: EquipmentRow[]) => EquipmentRow[]) =>
          setSection("equipmentPackages", updater);
        return (
          <LineRow
            key={`pkg-${idx}`}
            testId={`invoice-row-package-${idx}`}
            removeLabel={`Remove ${pkg?.name ?? "package"}`}
            onRemove={() => setRows((prev) => removeRow(prev, idx))}
            detailsLabel="package details"
            defaultExpanded={excluded.size > 0}
            context={excluded.size > 0 ? "Package · items removed" : "Package"}
            details={
              <div className="space-y-3">
                <BasisToggle
                  id={`invoice-package-basis-${idx}`}
                  value={row.basis ?? "total"}
                  onChange={(basis) => setRows((prev) => patchRow(prev, idx, { basis }))}
                />
                {pkg?.items?.length ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Contents ({pkg.items.length}). Untick what the client doesn&apos;t need. Original package{" "}
                      {formatUsd(originalRate)}
                      {discount > 0 ? ` · discount ${formatUsd(discount)} · billed ${formatUsd(rate)}` : ""}
                    </p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {pkg.items.map((item) => (
                        <label key={item.typeId} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={!excluded.has(item.typeId)}
                            onChange={(event) => {
                              setRows((prev) =>
                                patchRow(prev, idx, (current) => {
                                  const next = new Set(current.excludedTypeIds ?? []);
                                  if (event.target.checked) next.delete(item.typeId);
                                  else next.add(item.typeId);
                                  return { ...current, excludedTypeIds: Array.from(next), discountUsd: "" };
                                }),
                              );
                            }}
                          />
                          <span>
                            {item.quantity}× {item.type?.name ?? "item"}
                            {item.type?.model ? ` · ${item.type.model}` : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                    {excluded.size > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor={`invoice-package-discount-${idx}`} className="text-xs">
                          Exclusion discount
                        </Label>
                        <Input
                          id={`invoice-package-discount-${idx}`}
                          className="h-8 w-28"
                          inputMode="decimal"
                          value={
                            row.discountUsd !== undefined && row.discountUsd !== ""
                              ? row.discountUsd
                              : suggestedDiscount.toFixed(2)
                          }
                          onChange={(event) =>
                            setRows((prev) => patchRow(prev, idx, { discountUsd: event.target.value }))
                          }
                        />
                        <span className="text-xs text-muted-foreground">Suggested {formatUsd(suggestedDiscount)}</span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Pick a package to see what&apos;s in it.</p>
                )}
              </div>
            }
          >
            <InventoryPackageSearchSelect
              value={row.refId}
              onChange={(value) =>
                setRows((prev) => patchRow(prev, idx, { refId: value, excludedTypeIds: [], discountUsd: "" }))
              }
            />
            <Input
              aria-label="Quantity"
              placeholder="Qty"
              inputMode="decimal"
              value={row.quantity}
              onChange={(event) => setRows((prev) => patchRow(prev, idx, { quantity: event.target.value }))}
            />
            <StaticCell title={discount > 0 ? `Original ${formatUsd(originalRate)}` : undefined}>
              {formatUsd(rate)}
            </StaticCell>
            <AmountCell amountUsd={billedQty * rate} hint={hint} />
          </LineRow>
        );
      })}
      {types.map((row, idx) => {
        const type = typeById.get(row.refId);
        const rate = typeRate(type, mode);
        const { billedQty, hint } = billing(row, billableOccurrenceCount);
        const setRows = (updater: (rows: EquipmentRow[]) => EquipmentRow[]) => setSection("equipmentTypes", updater);
        return (
          <LineRow
            key={`type-${idx}`}
            testId={`invoice-row-type-${idx}`}
            removeLabel={`Remove ${type?.name ?? "equipment"}`}
            onRemove={() => setRows((prev) => removeRow(prev, idx))}
            detailsLabel="quantity basis"
            context="Individual item"
            details={
              <BasisToggle
                id={`invoice-type-basis-${idx}`}
                value={row.basis ?? "total"}
                onChange={(basis) => setRows((prev) => patchRow(prev, idx, { basis }))}
              />
            }
          >
            <InventoryTypeSearchSelect
              value={row.refId}
              onChange={(value) => setRows((prev) => patchRow(prev, idx, { refId: value }))}
            />
            <Input
              aria-label="Quantity"
              placeholder="Qty"
              inputMode="decimal"
              value={row.quantity}
              onChange={(event) => setRows((prev) => patchRow(prev, idx, { quantity: event.target.value }))}
            />
            <StaticCell>{formatUsd(rate)}</StaticCell>
            <AmountCell amountUsd={billedQty * rate} hint={hint} />
          </LineRow>
        );
      })}
    </LineGroup>
  );
}
