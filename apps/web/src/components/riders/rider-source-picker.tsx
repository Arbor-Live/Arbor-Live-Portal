"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDownIcon, CheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import {
  commonRiderSources,
  matchRiderSource,
  riderSource,
  riderSourcesByFamily,
  searchRiderSources,
  type RiderSourceDefinition,
} from "@arbor/rider-document";
import { cn } from "@/lib/utils";

/** Also the flip threshold — below this much room, the list opens upward. */
const MAX_LIST_HEIGHT = 288;

export type RiderSourceSelection = {
  /** Undefined when the band typed something the catalogue does not know. */
  source?: RiderSourceDefinition;
  /** What they typed, kept verbatim as the channel's display text. */
  text: string;
};

type Props = {
  /** Canonical role, if this channel has one. */
  sourceKey?: string;
  /** The band's own wording for this channel. */
  value: string;
  disabled?: boolean;
  className?: string;
  onChange: (selection: RiderSourceSelection) => void;
  /** Rendered after the name, e.g. the derived "2" of "Guitar 2". */
  ordinal?: number;
  /**
   * Focus on mount, which opens the list — "Add channel" sets it so the band
   * picks what the row is instead of facing an empty box.
   */
  autoFocus?: boolean;
};

/**
 * Source cell: a combobox over the controlled vocabulary that still accepts
 * anything typed.
 *
 * Committing free text is deliberate — bands turn up with instruments no
 * catalogue anticipates, and a picker that blocks them just gets the nearest
 * wrong option chosen to escape, which is worse than an honest blank. Unmapped
 * rows are marked here and counted in the rider warnings instead.
 */
export function RiderSourcePicker({
  sourceKey,
  value,
  disabled,
  className,
  onChange,
  ordinal,
  autoFocus,
}: Props) {
  // Seeded rather than opened from `onFocus`: `autoFocus` focuses during commit,
  // so relying on the focus handler to open the list is racy. Initial state only
  // — later renders ignore it, which is exactly the "just created" semantics.
  const [open, setOpen] = useState(Boolean(autoFocus));
  // Only meaningful while open; closed, the cell renders the stored text, so
  // there is nothing to sync back when `value` changes underneath.
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    placement: "below" | "above";
  } | null>(null);

  const selected = sourceKey ? riderSource(sourceKey) : undefined;
  const unmapped = !selected;
  const display = open ? query : value;
  const searching = open && query.trim() !== "" && query.trim() !== value.trim();

  const results = useMemo(
    () => (searching ? searchRiderSources(query.trim()).slice(0, 12) : commonRiderSources()),
    [searching, query],
  );

  function openWith(text: string) {
    setQuery(text);
    setActiveIndex(0);
    setOpen(true);
  }

  /**
   * The list is portalled to the body rather than positioned inside the cell:
   * the input table sits in an `overflow-x-auto` container, which computes
   * `overflow-y` to `auto` as well, so an absolutely-positioned child grows the
   * card instead of floating over it.
   */
  useLayoutEffect(() => {
    // Nothing to clear on close — the list only renders while open, and the
    // position is remeasured before paint the next time it opens.
    if (!open) return;
    function measure() {
      const anchor = rootRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const below = window.innerHeight - anchor.bottom;
      setBox({
        left: anchor.left,
        top: below < MAX_LIST_HEIGHT + 8 ? anchor.top : anchor.bottom + 4,
        width: Math.max(anchor.width, 240),
        placement: below < MAX_LIST_HEIGHT + 8 ? "above" : "below",
      });
    }
    measure();
    // `true` so an ancestor scrolling (the table, the page) repositions us too.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function commitSource(source: RiderSourceDefinition) {
    onChange({ source, text: source.label });
    setOpen(false);
  }

  /** Enter on free text: take an exact vocabulary hit, else keep the words. */
  function commitText() {
    const text = query.trim();
    if (!text) {
      setOpen(false);
      return;
    }
    const matched = matchRiderSource(text);
    onChange(matched ? { source: matched, text } : { text });
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openWith(value);
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => {
        if (results.length === 0) return 0;
        return (index + delta + results.length) % results.length;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const active = open ? results[activeIndex] : undefined;
      if (active) commitSource(active);
      else commitText();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          // Deliberate: the row was just created by clicking "Add channel".
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          className={cn(
            "h-8 w-full min-w-0 rounded-none border border-input bg-transparent py-1 pl-2 pr-12 text-sm outline-none",
            "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50",
            unmapped && value.trim() && "border-amber-500/70",
          )}
          disabled={disabled}
          value={display}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => openWith(value)}
          onBlur={(event) => {
            // Losing focus to the list itself is not a dismissal — it now
            // lives in a portal, so check it separately from the cell.
            const next = event.relatedTarget as Node | null;
            if (rootRef.current?.contains(next)) return;
            if (listRef.current?.contains(next)) return;
            if (open && query.trim() !== value.trim()) commitText();
            else setOpen(false);
          }}
          onKeyDown={handleKeyDown}
        />
        <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-1">
          {ordinal ? (
            <span className="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
              {ordinal}
            </span>
          ) : null}
          {unmapped && value.trim() ? (
            <WarningCircleIcon
              className="size-3.5 text-amber-600"
              aria-label="Not matched to a source type"
            />
          ) : null}
          {!disabled ? (
            <CaretDownIcon className="size-3 text-muted-foreground/60" />
          ) : null}
        </span>
      </div>

      {open && !disabled && box
        ? createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          style={{
            position: "fixed",
            left: box.left,
            width: box.width,
            maxHeight: MAX_LIST_HEIGHT,
            ...(box.placement === "below"
              ? { top: box.top }
              : { bottom: window.innerHeight - box.top + 4 }),
          }}
          className="z-50 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {searching ? (
            results.length > 0 ? (
              results.map((source, index) => (
                <Option
                  key={source.key}
                  source={source}
                  active={index === activeIndex}
                  selected={source.key === sourceKey}
                  onPick={() => commitSource(source)}
                  onHover={() => setActiveIndex(index)}
                />
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No match — press Enter to keep “{query.trim()}” and we&apos;ll sort it
                at load-in.
              </p>
            )
          ) : (
            <BrowseList
              activeKey={results[activeIndex]?.key}
              selectedKey={sourceKey}
              onPick={commitSource}
            />
          )}
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function Option({
  source,
  active,
  selected,
  onPick,
  onHover,
}: {
  source: RiderSourceDefinition;
  active?: boolean;
  selected?: boolean;
  onPick: () => void;
  onHover?: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
      onMouseEnter={onHover}
      // Commit before blur so the click is not swallowed by the dismiss handler.
      onMouseDown={(event) => {
        event.preventDefault();
        onPick();
      }}
    >
      <span className="truncate">{source.label}</span>
      <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
        {source.captures.length > 1 ? (
          <span>{source.captures.map((capture) => capture.inputType).join(" / ")}</span>
        ) : null}
        {source.stereo ? <span className="rounded bg-muted px-1">ST</span> : null}
        {selected ? <CheckIcon className="size-3" /> : null}
      </span>
    </button>
  );
}

/** Common roles first, then the full catalogue by family. */
function BrowseList({
  activeKey,
  selectedKey,
  onPick,
}: {
  activeKey?: string;
  selectedKey?: string;
  onPick: (source: RiderSourceDefinition) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const common = commonRiderSources();

  return (
    <>
      <p className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Common
      </p>
      {common.map((source) => (
        <Option
          key={source.key}
          source={source}
          active={source.key === activeKey}
          selected={source.key === selectedKey}
          onPick={() => onPick(source)}
        />
      ))}
      {showAll ? (
        riderSourcesByFamily().map((group) => (
          <div key={group.family}>
            <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            {group.sources.map((source) => (
              <Option
                key={source.key}
                source={source}
                selected={source.key === selectedKey}
                onPick={() => onPick(source)}
              />
            ))}
          </div>
        ))
      ) : (
        <button
          type="button"
          className="mt-1 w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent/60"
          onMouseDown={(event) => {
            event.preventDefault();
            setShowAll(true);
          }}
        >
          Show everything else…
        </button>
      )}
    </>
  );
}
