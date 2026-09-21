"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  featuredMarketingLinkIcons,
  filterMarketingLinkIcons,
  getMarketingLinkIcon,
  loadMarketingLinkIcon,
  type MarketingLinkIconDef,
} from "@/lib/marketing-link-icons";
import { cn } from "@/lib/utils";
import { LinkSimpleIcon } from "@phosphor-icons/react";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & {
    weight?: "regular" | "bold" | "fill" | "light" | "thin" | "duotone";
  }
>;

/** Wrap components so useState doesn't treat them as updater functions. */
type IconHolder = { Icon: IconComponent };

export function IconPicker({
  value,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Choose icon",
}: {
  value?: string | null;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = getMarketingLinkIcon(value);
  const [{ Icon: SelectedIcon }, setSelectedIcon] = useState<IconHolder>({
    Icon: LinkSimpleIcon,
  });

  useEffect(() => {
    let cancelled = false;
    void loadMarketingLinkIcon(value).then((Icon) => {
      if (!cancelled) setSelectedIcon({ Icon });
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const filtered = useMemo(() => filterMarketingLinkIcons(query), [query]);
  const featured = useMemo(() => featuredMarketingLinkIcons(), []);
  const searching = query.trim().length > 0;

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
      <PopoverContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] gap-2 p-2"
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search icons…"
          autoFocus
          className="h-8"
        />
        {!searching ? (
          <div className="space-y-1.5">
            <p className="px-0.5 text-3xs font-medium uppercase tracking-wider text-muted-foreground">
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
        ) : (
          <div className="space-y-1.5">
            <p className="px-0.5 text-3xs font-medium uppercase tracking-wider text-muted-foreground">
              Results
            </p>
            {filtered.length === 0 ? (
              <p className="px-0.5 py-2 text-xs text-muted-foreground">No icons match.</p>
            ) : (
              <IconGrid
                icons={filtered}
                value={value}
                onSelect={(id) => {
                  onChange(id);
                  setOpen(false);
                  setQuery("");
                }}
              />
            )}
          </div>
        )}
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
  icons: MarketingLinkIconDef[];
  value?: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto">
      {icons.map((icon) => (
        <IconGridButton
          key={icon.id}
          id={icon.id}
          label={icon.label}
          selected={value === icon.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function IconGridButton({
  id,
  label,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const [{ Icon }, setIcon] = useState<IconHolder>({ Icon: LinkSimpleIcon });

  useEffect(() => {
    let cancelled = false;
    void loadMarketingLinkIcon(id).then((loaded) => {
      if (!cancelled) setIcon({ Icon: loaded });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent",
        selected && "bg-accent ring-1 ring-ring",
      )}
      onClick={() => onSelect(id)}
    >
      <Icon className="size-4" weight="regular" />
    </button>
  );
}
