"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  featuredMarketingLinkIcons,
  filterMarketingLinkIcons,
  getMarketingLinkIcon,
  MARKETING_LINK_ICONS,
  type MarketingLinkIconId,
} from "@/lib/marketing-link-icons";
import { cn } from "@/lib/utils";

export function IconPicker({
  value,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Choose icon",
}: {
  value?: string | null;
  onChange: (value: MarketingLinkIconId | undefined) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = getMarketingLinkIcon(value);
  const SelectedIcon = selected.Icon;

  const filtered = useMemo(() => filterMarketingLinkIcons(query), [query]);
  const featured = useMemo(() => featuredMarketingLinkIcons(), []);
  const searching = query.trim().length > 0;
  const rest = searching
    ? filtered
    : MARKETING_LINK_ICONS.filter((icon) => !icon.featured);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label={ariaLabel}
          title={selected.label}
          className={cn("size-9 shrink-0", className)}
        >
          <SelectedIcon className="size-4" weight="regular" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 p-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search icons…"
          autoFocus
          className="h-8"
        />
        {!searching ? (
          <div className="space-y-1.5">
            <p className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Popular
            </p>
            <IconGrid
              icons={featured}
              value={value}
              onSelect={(id) => {
                onChange(id);
                setOpen(false);
                setQuery("");
              }}
            />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <p className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {searching ? "Results" : "More"}
          </p>
          {rest.length === 0 ? (
            <p className="px-0.5 py-2 text-xs text-muted-foreground">No icons match.</p>
          ) : (
            <IconGrid
              icons={rest}
              value={value}
              onSelect={(id) => {
                onChange(id);
                setOpen(false);
                setQuery("");
              }}
            />
          )}
        </div>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full text-xs"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
              setQuery("");
            }}
          >
            Clear icon
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function IconGrid({
  icons,
  value,
  onSelect,
}: {
  icons: Array<{ id: MarketingLinkIconId; label: string; Icon: (typeof MARKETING_LINK_ICONS)[number]["Icon"] }>;
  value?: string | null;
  onSelect: (id: MarketingLinkIconId) => void;
}) {
  return (
    <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto">
      {icons.map((icon) => {
        const selected = value === icon.id;
        const Glyph = icon.Icon;
        return (
          <button
            key={icon.id}
            type="button"
            title={icon.label}
            aria-label={icon.label}
            aria-pressed={selected}
            className={cn(
              "flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent",
              selected && "bg-accent ring-1 ring-ring",
            )}
            onClick={() => onSelect(icon.id)}
          >
            <Glyph className="size-4" weight="regular" />
          </button>
        );
      })}
    </div>
  );
}
