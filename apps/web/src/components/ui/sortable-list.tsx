"use client";

/*
 * Refs here are only read inside event handlers and ref callbacks — never during
 * render — but the compiler lint cannot see through the callbacks it is handed.
 */
/* eslint-disable react-hooks/refs */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * A gesture on one of these stays a click; everything else on a row drags it.
 * Embedded browsers do not always report `pointerType === "mouse"`, so the
 * gesture is accepted from any pointer type.
 */
const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a, [contenteditable="true"], [role="combobox"], [role="dialog"], [role="listbox"], [data-slot="popover-trigger"]';

export type SortableRowControls = {
  /** Spread on a grip to start a drag from that element specifically. */
  handleProps: { onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void };
  moveUp: () => void;
  moveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
};

function moveInArray<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

/**
 * Drag- and button-reorderable list. The drag only highlights a target and
 * commits once on release — reordering mid-gesture moves the target out from
 * under the cursor, which is what made earlier versions feel broken.
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  rowClassName,
  rowTestId,
  disabled = false,
  canDrag,
}: {
  items: T[];
  getId: (item: T, index: number) => string;
  onReorder: (orderedItems: T[], orderedIds: string[]) => void;
  renderItem: (item: T, index: number, controls: SortableRowControls) => ReactNode;
  rowClassName?: string | ((item: T, index: number) => string);
  rowTestId?: string;
  disabled?: boolean;
  /** Rows this returns false for cannot be dragged or moved. */
  canDrag?: (item: T, index: number) => boolean;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dropIndexRef = useRef(-1);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const idsRef = useRef<string[]>([]);
  const itemsRef = useRef<T[]>([]);
  // `endDrag` runs from a window listener, so read the predicate through a ref.
  const draggableRef = useRef<(index: number) => boolean>(() => true);

  useEffect(() => {
    itemsRef.current = items;
    idsRef.current = items.map((item, index) => getId(item, index));
  });

  const setRowRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) rowRefs.current.set(id, element);
    else rowRefs.current.delete(id);
  }, []);

  /** Index of the row nearest a viewport Y, so gaps still pick a target. */
  const indexAtPoint = useCallback((clientY: number) => {
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    idsRef.current.forEach((id, index) => {
      const element = rowRefs.current.get(id);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const distance = Math.abs(clientY - (rect.top + rect.height / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }, []);

  const commit = useCallback(
    (from: number, to: number) => {
      const ids = idsRef.current;
      if (from < 0 || to < 0 || from === to) return;
      const nextIds = moveInArray(ids, from, to);
      const byId = new Map(ids.map((id, index) => [id, itemsRef.current[index]] as const));
      const nextItems = nextIds.flatMap((id) => {
        const item = byId.get(id);
        return item === undefined ? [] : [item];
      });
      onReorder(nextItems, nextIds);
    },
    [onReorder],
  );

  const begin = useCallback((id: string) => {
    draggingIdRef.current = id;
    dropIndexRef.current = idsRef.current.indexOf(id);
    setDraggingId(id);
    setDropIndex(dropIndexRef.current);
  }, []);

  const endDrag = useCallback(
    (dropped: boolean) => {
      const id = draggingIdRef.current;
      const to = dropIndexRef.current;
      draggingIdRef.current = null;
      dropIndexRef.current = -1;
      setDraggingId(null);
      setDropIndex(null);
      // A cancelled pointer is not a drop: reset without reordering.
      if (!dropped || !id) return;
      const from = idsRef.current.indexOf(id);
      // Stay inside the contiguous run of draggable rows around the source, so
      // a position cannot be dropped among rows that are not sortable.
      if (from < 0 || !draggableRef.current(from)) return;
      let low = from;
      while (low - 1 >= 0 && draggableRef.current(low - 1)) low -= 1;
      let high = from;
      while (high + 1 < idsRef.current.length && draggableRef.current(high + 1)) high += 1;
      commit(from, Math.min(Math.max(to, low), high));
    },
    [commit],
  );

  const draggable = useCallback(
    (item: T, index: number) => !disabled && (canDrag?.(item, index) ?? true),
    [disabled, canDrag],
  );

  useEffect(() => {
    draggableRef.current = (index: number) => draggable(items[index]!, index);
  });

  const move = useCallback(
    (id: string, delta: number) => {
      const from = idsRef.current.indexOf(id);
      commit(from, from + delta);
    },
    [commit],
  );

  // The gesture runs on window listeners so it keeps tracking outside the row.
  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!draggingIdRef.current) return;
      const to = indexAtPoint(event.clientY);
      if (to < 0 || to === dropIndexRef.current) return;
      dropIndexRef.current = to;
      setDropIndex(to);
    }
    function onUp() {
      endDrag(true);
    }
    function onCancel() {
      endDrag(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [endDrag, indexAtPoint]);

  return (
    <div className={cn("flex flex-col gap-2", draggingId && "select-none")}>
      {items.map((item, index) => {
        const id = getId(item, index);
        const isDragging = draggingId === id;
        const isDropTarget = dropIndex === index && !isDragging;
        const className =
          typeof rowClassName === "function" ? rowClassName(item, index) : rowClassName;
        return (
          <div
            key={id}
            ref={(element) => setRowRef(id, element)}
            data-testid={rowTestId}
            onPointerDown={(event) => {
              if (!draggable(item, index) || event.button !== 0) return;
              if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
              event.preventDefault();
              begin(id);
            }}
            className={cn(
              className,
              isDragging && "border-primary/60 bg-muted/40 opacity-70",
              isDropTarget && "border-primary/60 bg-primary/5",
            )}
          >
            {renderItem(item, index, {
              handleProps: {
                onPointerDown: (event) => {
                  if (!draggable(item, index)) return;
                  event.preventDefault();
                  begin(id);
                },
              },
              moveUp: () => move(id, -1),
              moveDown: () => move(id, 1),
              // Only swap with another sortable row, so unplaced acts stay put
              // and a position cannot move into their area.
              canMoveUp:
                index > 0 && draggable(item, index) && draggable(items[index - 1]!, index - 1),
              canMoveDown:
                index < items.length - 1 &&
                draggable(item, index) &&
                draggable(items[index + 1]!, index + 1),
              isDragging,
              isDropTarget,
            })}
          </div>
        );
      })}
    </div>
  );
}
