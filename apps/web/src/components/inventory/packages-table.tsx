"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { ListRow } from "@/components/list-row";
import { RowCell, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { formatUsdOptional } from "@/lib/format";
import {
  PACKAGE_STATUS_LABELS,
  PACKAGE_STATUS_TONES,
  packageContentsSummary,
  packagePriceUsd,
  packageStatus,
  type PackageRow,
} from "./package-form";
import { publicBucketLabels, type PublicPackageBucket } from "./package-section-utils";

type Selection = {
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
};

function selectionState(rows: PackageRow[], selected: Set<string>) {
  const all = rows.length > 0 && rows.every((row) => selected.has(row._id));
  const some = !all && rows.some((row) => selected.has(row._id));
  return all ? true : some ? ("indeterminate" as const) : false;
}

function setMany(selected: Set<string>, ids: string[], checked: boolean) {
  const next = new Set(selected);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

/**
 * The packages list: one row per package, opening the side panel. Grouped by
 * section when sorted by section, flat otherwise. Checkboxes feed the bulk bar.
 */
export function PackagesTable({
  rows,
  groups,
  sectionOf,
  selected,
  onSelectedChange,
  onOpen,
  onDelete,
}: Selection & {
  rows: PackageRow[];
  /** Section groups, in order; null for a flat list. */
  groups: Array<{ section: PublicPackageBucket; rows: PackageRow[] }> | null;
  sectionOf: (row: PackageRow) => PublicPackageBucket;
  onOpen: (row: PackageRow) => void;
  onDelete: (row: PackageRow) => void;
}) {
  function renderRow(row: PackageRow) {
    const status = packageStatus(row);
    const units = row.contents?.length ?? 0;
    return (
      <ListRow
        key={row._id}
        data-testid={`package-row-${row._id}`}
        onOpen={() => onOpen(row)}
        leading={
          <Checkbox
            aria-label={`Select ${row.name}`}
            checked={selected.has(row._id)}
            onCheckedChange={(checked) => onSelectedChange(setMany(selected, [row._id], checked === true))}
          />
        }
        actions={
          <RowMenu label={`More for ${row.name}`}>
            <DropdownMenuItem onSelect={() => onOpen(row)}>Open details</DropdownMenuItem>
            {status === "listed" ? (
              <DropdownMenuItem asChild>
                <a href={`/packages/view/${row._id}`} target="_blank" rel="noreferrer">
                  View public page
                  <ArrowSquareOutIcon className="ml-auto size-3" aria-hidden />
                </a>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(row)}>
              Delete package
            </DropdownMenuItem>
          </RowMenu>
        }
      >
        <RowText
          eyebrow={`${publicBucketLabels[sectionOf(row)]} · ${units} unit${units === 1 ? "" : "s"}`}
          title={row.name}
          detail={packageContentsSummary(row)}
        />
        <RowCell className="w-24" hideBelow="lg" muted>
          {formatUsdOptional(row.estimatedRentalValueUsd)}
        </RowCell>
        <RowCell className="w-24" hideBelow="sm">
          {formatUsdOptional(packagePriceUsd(row))}
        </RowCell>
        <StatusPill
          tone={PACKAGE_STATUS_TONES[status]}
          className="hidden h-6 w-32 shrink-0 justify-center md:inline-flex"
        >
          {PACKAGE_STATUS_LABELS[status]}
        </StatusPill>
      </ListRow>
    );
  }

  return (
    <div className="border" data-testid="packages-list">
      <div className="flex items-center gap-2 border-b bg-muted/20 py-2 pr-1 pl-3 text-xs font-medium text-muted-foreground">
        <Checkbox
          aria-label="Select all packages shown"
          checked={selectionState(rows, selected)}
          onCheckedChange={(checked) =>
            onSelectedChange(checked === true ? new Set(rows.map((row) => row._id)) : new Set())
          }
        />
        <span className="flex-1">Package</span>
        <span className="hidden w-24 text-right lg:block">Est. value</span>
        <span className="hidden w-24 text-right sm:block">Price</span>
        <span className="hidden w-32 text-center md:block">Status</span>
        <span className="w-8" />
      </div>
      {groups ? (
        groups.map((group) => (
          <RowGroup
            key={group.section}
            title={publicBucketLabels[group.section]}
            count={group.rows.length}
            testId={`packages-group-${group.section}`}
            className="border-b last:border-b-0"
            leading={
              <Checkbox
                aria-label={`Select all ${publicBucketLabels[group.section]} packages`}
                checked={selectionState(group.rows, selected)}
                onCheckedChange={(checked) =>
                  onSelectedChange(
                    setMany(
                      selected,
                      group.rows.map((row) => row._id),
                      checked === true,
                    ),
                  )
                }
              />
            }
          >
            {group.rows.map(renderRow)}
          </RowGroup>
        ))
      ) : (
        <ul className="divide-y [&>li]:border-0">{rows.map(renderRow)}</ul>
      )}
    </div>
  );
}
