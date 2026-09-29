"use client";

import { CurrencyDollarIcon, TruckIcon } from "@phosphor-icons/react";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Input } from "@/components/ui/input";
import type { ExternalRentalRow, FeeRow } from "./invoice-draft-model";
import { AmountCell, LineColumnHeads, LineGroup, LineRow, patchRow, plural, removeRow } from "./line-items-layout";
import type { InvoiceDraft } from "./use-invoice-draft";

function lineAmount(quantity: string, rateUsd: string) {
  const qty = Number(quantity);
  const rate = Number(rateUsd || "0");
  return Number.isFinite(qty) && Number.isFinite(rate) ? qty * rate : 0;
}

/** Gear rented from another provider and billed through (pass-through, not Arbor margin). */
export function RentalLines({ draft }: { draft: InvoiceDraft }) {
  const rows = draft.lines.externalRentals;
  if (rows.length === 0) return null;
  const setRows = (updater: (rows: ExternalRentalRow[]) => ExternalRentalRow[]) =>
    draft.setSection("externalRentals", updater);
  return (
    <LineGroup
      icon={TruckIcon}
      title="External rentals"
      detail={plural(rows.length, "line")}
      subtotalUsd={draft.draftTotals.externalRentalsSubtotalUsd}
      subtotalTestId="invoice-total-external"
      testId="invoice-group-rentals"
    >
      <LineColumnHeads item="Item · provider" />
      {rows.map((row, idx) => (
        <LineRow
          key={`ext-${idx}`}
          testId={`invoice-row-external-rental-${idx}`}
          removeLabel={`Remove ${row.label.trim() || "rental"}`}
          onRemove={() => setRows((prev) => removeRow(prev, idx))}
        >
          <div className="grid min-w-0 gap-2 @md/lines:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Input
              aria-label="Rental item"
              placeholder="Line item"
              value={row.label}
              onChange={(event) => setRows((prev) => patchRow(prev, idx, { label: event.target.value }))}
            />
            <Input
              aria-label="Provider"
              placeholder="Provider"
              value={row.provider}
              onChange={(event) => setRows((prev) => patchRow(prev, idx, { provider: event.target.value }))}
            />
          </div>
          <Input
            aria-label="Quantity"
            placeholder="Qty"
            inputMode="decimal"
            value={row.quantity}
            onChange={(event) => setRows((prev) => patchRow(prev, idx, { quantity: event.target.value }))}
          />
          <Input
            aria-label="Rate"
            placeholder="Rate"
            inputMode="decimal"
            value={row.rateUsd}
            onChange={(event) => setRows((prev) => patchRow(prev, idx, { rateUsd: event.target.value }))}
          />
          <AmountCell amountUsd={lineAmount(row.quantity, row.rateUsd)} />
        </LineRow>
      ))}
    </LineGroup>
  );
}

/**
 * Fees. Picking a fee definition fills the label and its default amount.
 * `options` is the fee catalog, loaded once the group is used.
 */
export function FeeLines({
  draft,
  options,
  onUse,
}: {
  draft: InvoiceDraft;
  options: Array<{ _id: string; label: string; defaultAmountUsd?: number }>;
  /** Called on hover/focus so the catalog loads before the picker opens. */
  onUse: () => void;
}) {
  const rows = draft.lines.fees;
  if (rows.length === 0) return null;
  const selectOptions = options.map((option) => ({ value: option._id, label: option.label }));
  const setRows = (updater: (rows: FeeRow[]) => FeeRow[]) => draft.setSection("fees", updater);
  return (
    <div onFocusCapture={onUse} onMouseEnter={onUse}>
      <LineGroup
        icon={CurrencyDollarIcon}
        title="Fees"
        detail={plural(rows.length, "line")}
        subtotalUsd={draft.draftTotals.feesSubtotalUsd}
        subtotalTestId="invoice-total-fees"
        testId="invoice-group-fees"
      >
        <LineColumnHeads item="Fee · label" />
        {rows.map((row, idx) => (
          <LineRow
            key={`fee-${idx}`}
            testId={`invoice-row-fee-${idx}`}
            removeLabel={`Remove ${row.label.trim() || "fee"}`}
            onRemove={() => setRows((prev) => removeRow(prev, idx))}
          >
            <div className="grid min-w-0 gap-2 @md/lines:grid-cols-2">
              <SearchableSelect
                value={row.feeDefinitionId}
                onChange={(value) => {
                  const selected = options.find((fee) => fee._id === value);
                  setRows((prev) =>
                    patchRow(prev, idx, (current) => ({
                      ...current,
                      feeDefinitionId: value,
                      label: selected?.label ?? current.label,
                      rateUsd: (selected?.defaultAmountUsd ?? Number(current.rateUsd || "0")).toString(),
                    })),
                  );
                }}
                options={selectOptions}
                placeholder="Search fee definition..."
                emptyLabel="Select fee"
              />
              <Input
                aria-label="Fee label"
                placeholder="Label"
                value={row.label}
                onChange={(event) => setRows((prev) => patchRow(prev, idx, { label: event.target.value }))}
              />
            </div>
            <Input
              aria-label="Quantity"
              placeholder="Qty"
              inputMode="decimal"
              value={row.quantity}
              onChange={(event) => setRows((prev) => patchRow(prev, idx, { quantity: event.target.value }))}
            />
            <Input
              aria-label="Rate"
              placeholder="Rate"
              inputMode="decimal"
              value={row.rateUsd}
              onChange={(event) => setRows((prev) => patchRow(prev, idx, { rateUsd: event.target.value }))}
            />
            <AmountCell amountUsd={lineAmount(row.quantity, row.rateUsd)} />
          </LineRow>
        ))}
      </LineGroup>
    </div>
  );
}
