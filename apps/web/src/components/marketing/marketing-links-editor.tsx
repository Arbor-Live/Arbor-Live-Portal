"use client";

import { useState } from "react";
import { CaretDownIcon, CaretUpIcon, DotsSixVerticalIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SortableList } from "@/components/ui/sortable-list";
import {
  emptyMarketingLink,
  isPartifulCohostInviteUrl,
  linksIncludePartiful,
  type MarketingAdditionalLink,
} from "@/components/marketing/event-marketing-content-fields";
import { guessMarketingLinkIcon } from "@/lib/marketing-link-icons";
import { cn } from "@/lib/utils";

const MAX_ADDITIONAL_LINKS = 10;

function newRowKey() {
  return crypto.randomUUID();
}


export function MarketingLinksEditor({
  idPrefix,
  links,
  onLinksChange,
  partifulCohostUrl,
  onPartifulCohostUrlChange,
  disabled = false,
  showCohost = true,
  label = "Links",
}: {
  idPrefix: string;
  links: MarketingAdditionalLink[];
  onLinksChange: (links: MarketingAdditionalLink[]) => void;
  partifulCohostUrl?: string;
  onPartifulCohostUrlChange?: (value: string) => void;
  disabled?: boolean;
  /** Host portals only — admins see a read-only cohost surface separately. */
  showCohost?: boolean;
  label?: string;
}) {
  const rows = links.length > 0 ? links : [emptyMarketingLink()];
  const showPartifulCohost =
    showCohost && Boolean(onPartifulCohostUrlChange) && linksIncludePartiful(rows);

  const [rowKeys, setRowKeys] = useState<string[]>([]);
  const [rowKeysLength, setRowKeysLength] = useState(0);
  if (rows.length !== rowKeysLength) {
    setRowKeysLength(rows.length);
    setRowKeys((keys) => {
      if (keys.length === rows.length) return keys;
      if (keys.length < rows.length) {
        return [
          ...keys,
          ...Array.from({ length: rows.length - keys.length }, () => newRowKey()),
        ];
      }
      return keys.slice(0, rows.length);
    });
  }

  function updateLink(index: number, patch: Partial<MarketingAdditionalLink>) {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    onLinksChange(next);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {rows.length > 0 ? (
        <SortableList
          items={rows}
          getId={(_, index) => rowKeys[index] ?? `${idPrefix}-link-${index}`}
          disabled={disabled}
          onReorder={(orderedRows, orderedIds) => {
            onLinksChange(orderedRows);
            setRowKeys(orderedIds);
          }}
          rowClassName="flex flex-col gap-2 rounded-md border border-border/60 p-2 sm:flex-row sm:items-center sm:border-transparent sm:p-0"
          renderItem={(link, index, controls) => (
            <>
              <div className="flex shrink-0 items-center gap-0.5">
                <span
                  {...controls.handleProps}
                  className={cn(
                    "flex size-9 touch-none select-none items-center justify-center text-muted-foreground/60",
                    disabled
                      ? "cursor-default opacity-40"
                      : "cursor-grab active:cursor-grabbing",
                  )}
                  title="Drag to reorder"
                >
                  <DotsSixVerticalIcon className="size-4" weight="bold" />
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0"
                  disabled={disabled || !controls.canMoveUp}
                  title="Move up"
                  onClick={controls.moveUp}
                >
                  <CaretUpIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0"
                  disabled={disabled || !controls.canMoveDown}
                  title="Move down"
                  onClick={controls.moveDown}
                >
                  <CaretDownIcon className="size-4" />
                </Button>
              </div>
            <div className="flex flex-col gap-2 sm:contents">
              <div className="flex items-center gap-2 sm:min-w-0 sm:flex-1">
                <IconPicker
                  value={link.icon}
                  disabled={disabled}
                  aria-label={`Icon for link ${index + 1}`}
                  onChange={(icon) => updateLink(index, { icon })}
                />
                <Input
                  value={link.label}
                  placeholder="Label (e.g. Partiful RSVP)"
                  disabled={disabled}
                  className="min-w-0 flex-1"
                  onChange={(event) => updateLink(index, { label: event.target.value })}
                />
              </div>
              <Input
                value={link.url}
                placeholder="https://..."
                disabled={disabled}
                className="min-w-0 sm:flex-1"
                onChange={(event) => {
                  const nextUrl = event.target.value;
                  const guessed = guessMarketingLinkIcon(nextUrl);
                  updateLink(index, {
                    url: nextUrl,
                    ...(guessed && !link.icon ? { icon: guessed } : {}),
                  });
                }}
              />
            </div>
            </>
          )}
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || rows.length >= MAX_ADDITIONAL_LINKS}
        onClick={() => {
          onLinksChange([...rows, emptyMarketingLink()]);
        }}
      >
        Add link
      </Button>

      {showPartifulCohost && onPartifulCohostUrlChange ? (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <Label htmlFor={`${idPrefix}-partiful-cohost`}>Partiful cohost invite (optional)</Label>
          <Input
            id={`${idPrefix}-partiful-cohost`}
            value={partifulCohostUrl ?? ""}
            placeholder="https://partiful.com/e/... (cohost invite)"
            disabled={disabled}
            onChange={(event) => onPartifulCohostUrlChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Fully optional. Lets Arbor Live join as a cohost — not shown on the public event page.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Host-submitted Partiful cohost invite (not editable in admin marketing UI). */
export function PartifulCohostAdminLink({ url }: { url?: string | null }) {
  const href = url?.trim();
  if (!href || !isPartifulCohostInviteUrl(href)) return null;
  return (
    <div className="space-y-1 rounded-md border border-dashed p-3">
      <Label>Partiful cohost invite</Label>
      <p className="text-sm">
        <a href={href} target="_blank" rel="noreferrer" className="break-all underline">
          {href}
        </a>
      </p>
      <p className="text-xs text-muted-foreground">Submitted by the host. Not shown publicly.</p>
    </div>
  );
}
