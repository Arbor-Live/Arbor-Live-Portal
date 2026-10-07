"use client";

import { StatusPill } from "@/components/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ListRow } from "@/components/list-row";
import { RowCell, RowMenu, RowText } from "@/components/list-page";
import { formatUsdOptional } from "@/lib/format";
import { formatTypeDisplay } from "./package-section-utils";
import {
  formatUnitCount,
  TYPE_VISIBILITY_LABELS,
  TYPE_VISIBILITY_TONES,
  typeVisibility,
  type InventoryTypeRow,
} from "./type-form";

/**
 * The types list: one row per model, opening the side panel. Checkboxes feed
 * the bulk bar; everything else about a row lives in its `⋯` menu.
 */
export function TypesTable({
  rows,
  categoryLabels,
  capabilityLabels,
  unitCounts,
  unitsTruncated,
  selected,
  onSelectedChange,
  onOpen,
  onSetVisibility,
  onDelete,
}: {
  rows: InventoryTypeRow[];
  categoryLabels: Map<string, string>;
  capabilityLabels: Map<string, string>;
  /** Undefined while the counts load. */
  unitCounts: Map<string, number> | undefined;
  /** The count scan hit its limit: counts are floors, and a missing type isn't known to be empty. */
  unitsTruncated: boolean;
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  onOpen: (row: InventoryTypeRow) => void;
  onSetVisibility: (row: InventoryTypeRow, visibility: { publicListing?: boolean; publicProfile?: boolean }) => void;
  onDelete: (row: InventoryTypeRow) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row._id));
  const someSelected = !allSelected && rows.some((row) => selected.has(row._id));

  function toggle(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  }

  return (
    <div className="border" data-testid="types-list">
      <div className="flex items-center gap-2 border-b bg-muted/20 py-2 pr-1 pl-3 text-xs font-medium text-muted-foreground">
        <Checkbox
          aria-label="Select all types shown"
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={(checked) => onSelectedChange(checked === true ? new Set(rows.map((row) => row._id)) : new Set())}
        />
        <span className="flex-1">Type</span>
        <span className="hidden w-20 text-right md:block">Normal rate</span>
        <span className="w-20 text-right">Units</span>
        <span className="hidden w-32 text-center sm:block">Public</span>
        <span className="w-8" />
      </div>
      <ul className="divide-y [&>li]:border-0">
        {rows.map((row) => {
          const visibility = typeVisibility(row);
          const units = unitCounts?.get(row._id) ?? 0;
          const capabilities = row.capabilities.map((key) => capabilityLabels.get(key) ?? key);
          return (
            <ListRow
              key={row._id}
              data-testid={`type-row-${row._id}`}
              onOpen={() => onOpen(row)}
              leading={
                <Checkbox
                  aria-label={`Select ${row.name}`}
                  checked={selected.has(row._id)}
                  onCheckedChange={(checked) => toggle(row._id, checked === true)}
                />
              }
              actions={
                <RowMenu label={`More for ${row.name}`}>
                  <DropdownMenuItem onSelect={() => onOpen(row)}>Open details</DropdownMenuItem>
                  {visibility === "hidden" ? (
                    <DropdownMenuItem onSelect={() => onSetVisibility(row, { publicListing: true })}>
                      List publicly
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() => onSetVisibility(row, { publicListing: false, publicProfile: false })}
                    >
                      Hide from public
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete(row)}>
                    Delete type
                  </DropdownMenuItem>
                </RowMenu>
              }
            >
              <RowText
                eyebrow={categoryLabels.get(row.category) ?? row.category}
                title={formatTypeDisplay(row)}
                detail={capabilities.length ? capabilities.join(" · ") : "No capabilities"}
              />
              <RowCell className="w-20" hideBelow="md">
                {formatUsdOptional(row.nonSubsidizedRentalPriceUsd ?? row.rentalPriceUsd)}
              </RowCell>
              <RowCell className="w-20">
                <span
                  data-testid="type-row-units"
                  className={units === 0 && unitCounts && !unitsTruncated ? "text-muted-foreground" : undefined}
                >
                  {unitCounts ? formatUnitCount(units, unitsTruncated) : "…"}
                </span>
              </RowCell>
              <StatusPill
                tone={TYPE_VISIBILITY_TONES[visibility]}
                className="hidden h-6 w-32 shrink-0 justify-center sm:inline-flex"
              >
                {TYPE_VISIBILITY_LABELS[visibility]}
              </StatusPill>
            </ListRow>
          );
        })}
      </ul>
    </div>
  );
}
