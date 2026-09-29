"use client";

import { DotsThreeIcon } from "@phosphor-icons/react";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "./constants";
import { formatTypeDisplay } from "./package-section-utils";
import {
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
      <ul className="divide-y">
        {rows.map((row) => {
          const visibility = typeVisibility(row);
          const units = unitCounts?.get(row._id) ?? 0;
          const capabilities = row.capabilities.map((key) => capabilityLabels.get(key) ?? key);
          return (
            <li
              key={row._id}
              data-testid={`type-row-${row._id}`}
              className="flex items-center gap-2 pr-1 pl-3 text-sm"
            >
              <Checkbox
                aria-label={`Select ${row.name}`}
                checked={selected.has(row._id)}
                onCheckedChange={(checked) => toggle(row._id, checked === true)}
              />
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left hover:bg-muted/30"
                data-testid="type-row-open"
                onClick={() => onOpen(row)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                    {categoryLabels.get(row.category) ?? row.category}
                  </p>
                  <p className="truncate font-medium">{formatTypeDisplay(row)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {capabilities.length ? capabilities.join(" · ") : "No capabilities"}
                  </p>
                </div>
                <span className="hidden w-20 shrink-0 text-right tabular-nums md:block">
                  {formatCurrency(row.nonSubsidizedRentalPriceUsd ?? row.rentalPriceUsd)}
                </span>
                <span
                  className={
                    units === 0 && unitCounts
                      ? "w-20 shrink-0 text-right text-muted-foreground tabular-nums"
                      : "w-20 shrink-0 text-right tabular-nums"
                  }
                  data-testid="type-row-units"
                >
                  {unitCounts ? `${units} unit${units === 1 ? "" : "s"}` : "…"}
                </span>
                <StatusPill
                  tone={TYPE_VISIBILITY_TONES[visibility]}
                  className="hidden h-6 w-32 shrink-0 justify-center sm:inline-flex"
                >
                  {TYPE_VISIBILITY_LABELS[visibility]}
                </StatusPill>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${row.name}`}>
                    <DotsThreeIcon weight="bold" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
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
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
