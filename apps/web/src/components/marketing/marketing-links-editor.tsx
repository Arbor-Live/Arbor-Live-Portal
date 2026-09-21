"use client";

import { useRef, useState } from "react";
import { DotsSixVerticalIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function moveInArray<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
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

  /**
   * Rows are only `draggable` once a pointer goes down on their grip handle —
   * a permanently draggable row steals text selection / focus in the inputs.
   * Same pattern as the rider input list / dashboard widgets.
   */
  const [dragArmedKey, setDragArmedKey] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragIndexRef = useRef(-1);

  function updateLink(index: number, patch: Partial<MarketingAdditionalLink>) {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    onLinksChange(next);
  }

  function reorderLive(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    onLinksChange(moveInArray(rows, from, to));
    setRowKeys((keys) => moveInArray(keys, from, to));
    dragIndexRef.current = to;
  }

  function handleDragEnd() {
    dragIndexRef.current = -1;
    setDragArmedKey(null);
    setDraggingKey(null);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {rows.map((link, index) => {
        const rowKey = rowKeys[index] ?? `${idPrefix}-link-${index}`;
        const isDragging = draggingKey === rowKey;
        return (
          <div
            key={rowKey}
            className={cn(
              "flex flex-col gap-2 rounded-md border border-border/60 p-2 sm:flex-row sm:items-center sm:border-transparent sm:p-0",
              isDragging && "border-border bg-muted/40 opacity-70",
            )}
            draggable={!disabled && dragArmedKey === rowKey}
            onDragStart={(event) => {
              dragIndexRef.current = index;
              setDraggingKey(rowKey);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", rowKey);
            }}
            onDragOver={(event) => {
              if (disabled || dragIndexRef.current < 0) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              // Shuffle as you hover so rows physically move while dragging.
              // If the browser cancels the drag after the DOM moves, order is
              // already updated — matching the "live reorder" feel.
              reorderLive(dragIndexRef.current, index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleDragEnd();
            }}
            onDragEnd={handleDragEnd}
          >
            <div className="flex shrink-0 items-center gap-0.5">
              <span
                className={cn(
                  "flex size-9 touch-none select-none items-center justify-center text-muted-foreground/60",
                  disabled
                    ? "cursor-default opacity-40"
                    : "cursor-grab active:cursor-grabbing",
                )}
                title="Drag to reorder"
                aria-hidden
                onPointerDown={() => {
                  if (!disabled) setDragArmedKey(rowKey);
                }}
                onPointerUp={() => setDragArmedKey(null)}
                onPointerCancel={() => setDragArmedKey(null)}
              >
                <DotsSixVerticalIcon className="size-4" weight="bold" />
              </span>
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
          </div>
        );
      })}
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
