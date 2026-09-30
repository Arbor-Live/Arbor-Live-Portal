"use client";

import { useMemo, useState } from "react";
import { FunnelSimpleIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  activeFilters,
  type FilterDefinition,
  type FilterOperator,
  type FilterState,
  type FilterValue,
} from "@/lib/filter-state";
import { cn } from "@/lib/utils";

/**
 * The dashboard's list filter bar: a search box, a "Filter" menu that adds a
 * filter as a chip ("Category is Lighting, Sound ×"), and "Clear all". Only
 * filters in use take up room. Each chip matches rows where any of its values
 * applies (`is`) or none does (`is not`).
 *
 * The bar owns no data: the page keeps the `FilterState`, turns it into query
 * arguments (or filters rows it already has in full), and passes it back.
 */

export {
  activeFilters,
  matchesFilter,
  type FilterDefinition,
  type FilterOperator,
  type FilterOption,
  type FilterState,
  type FilterValue,
} from "@/lib/filter-state";

function summarize(definition: FilterDefinition, values: string[]) {
  const labels = values.map(
    (value) => definition.options.find((option) => option.value === value)?.label ?? value,
  );
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  filters,
  value,
  onChange,
  children,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  searchPlaceholder: string;
  /** Accessible name for the search box ("Search types"). */
  searchLabel: string;
  filters: FilterDefinition[];
  value: FilterState;
  onChange: (value: FilterState) => void;
  /** Extra controls after the Filter button, e.g. a sort menu. */
  children?: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const available = filters.filter((definition) => !(definition.id in value));
  const chips = filters.filter((definition) => definition.id in value);
  const activeCount = Object.keys(activeFilters(value)).length;

  function setFilter(id: string, next: FilterValue | null) {
    const copy = { ...value };
    if (next) copy[id] = next;
    else delete copy[id];
    onChange(copy);
  }

  return (
    <div className="space-y-2" data-testid="filter-bar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" disabled={available.length === 0}>
              <FunnelSimpleIcon />
              Filter
              {activeCount ? <span className="tabular-nums text-muted-foreground">{activeCount}</span> : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-52"
            // Focus goes to the new chip's popover, not back to this button.
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenuLabel>Filter by</DropdownMenuLabel>
            {available.map((definition) => (
              <DropdownMenuItem
                key={definition.id}
                onSelect={() => {
                  setFilter(definition.id, { operator: "is", values: [] });
                  setOpenId(definition.id);
                }}
              >
                {definition.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {children}
      </div>
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="filter-chips">
          {chips.map((definition) => (
            <FilterChip
              key={definition.id}
              definition={definition}
              value={value[definition.id]}
              open={openId === definition.id}
              onOpenChange={(open) => {
                setOpenId(open ? definition.id : null);
                // A chip closed without a value was never really added.
                if (!open && value[definition.id]?.values.length === 0) setFilter(definition.id, null);
              }}
              onChange={(next) => setFilter(definition.id, next)}
              // A pick on a single-value chip closes it without the empty-chip check,
              // which would still see the value from before the pick.
              onPicked={() => setOpenId(null)}
              onRemove={() => setFilter(definition.id, null)}
            />
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  definition,
  value,
  open,
  onOpenChange,
  onChange,
  onPicked,
  onRemove,
}: {
  definition: FilterDefinition;
  value: FilterValue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: FilterValue) => void;
  onPicked: () => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState("");
  const negatable = definition.negatable ?? !definition.single;
  const searchable = definition.options.length > 8;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return definition.options;
    return definition.options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) || option.description?.toLowerCase().includes(needle),
    );
  }, [definition.options, query]);

  function toggle(optionValue: string, checked: boolean) {
    if (definition.single) {
      onChange({ ...value, values: [optionValue] });
      setQuery("");
      onPicked();
      return;
    }
    onChange({
      ...value,
      values: checked ? [...value.values, optionValue] : value.values.filter((entry) => entry !== optionValue),
    });
  }

  const idPrefix = `filter-${definition.id}`;

  return (
    <div
      className="inline-flex h-8 max-w-full items-stretch border text-sm"
      data-testid={`filter-chip-${definition.id}`}
    >
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) setQuery("");
          onOpenChange(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-1 px-2.5 hover:bg-muted/40"
          >
            {/* Real spaces between the parts, so the chip reads as a sentence. */}
            <span className="text-muted-foreground">{definition.label}</span>{" "}
            <span className="text-muted-foreground">{value.operator === "is" ? "is" : "is not"}</span>{" "}
            <span className={cn("max-w-56 truncate font-medium", !value.values.length && "text-muted-foreground")}>
              {value.values.length ? summarize(definition, value.values) : "…"}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 text-sm" data-testid={`filter-menu-${definition.id}`}>
          {negatable ? (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={value.operator}
              onValueChange={(operator) => {
                if (operator) onChange({ ...value, operator: operator as FilterOperator });
              }}
              aria-label={`${definition.label} match`}
            >
              <ToggleGroupItem value="is">is</ToggleGroupItem>
              <ToggleGroupItem value="is_not">is not</ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          {searchable ? (
            <Input
              placeholder={`Search ${definition.label.toLowerCase()}…`}
              aria-label={`Search ${definition.label.toLowerCase()}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
          <div className="max-h-64 space-y-0.5 overflow-auto">
            {shown.map((option) => {
              const id = `${idPrefix}-${option.value}`;
              const checked = value.values.includes(option.value);
              return (
                <div key={option.value} className="flex items-center gap-2 px-1 py-1 hover:bg-muted">
                  <Checkbox id={id} checked={checked} onCheckedChange={(next) => toggle(option.value, next === true)} />
                  <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer font-normal">
                    <span className="truncate">{option.label}</span>
                    {option.description ? (
                      <span className="truncate text-xs text-muted-foreground">{option.description}</span>
                    ) : null}
                  </Label>
                </div>
              );
            })}
            {!shown.length ? <p className="px-1 py-1 text-xs text-muted-foreground">Nothing matches.</p> : null}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={`Remove the ${definition.label} filter`}
        className="border-l px-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        onClick={onRemove}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
