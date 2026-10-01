"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  clampToStage,
  computePlotLayout,
  glyphNode,
  gridLineOffsets,
  itemGlyph,
  itemRect,
  itemTransform,
  labelRect,
  plotDrawOrder,
  pxToFt,
  riderSymbol,
  round,
} from "@arbor/rider-document";
import type { ItemRect, PlotLayout, RiderContent, RiderStageItem } from "@arbor/rider-document";
import { ArrowArcLeftIcon, ArrowArcRightIcon, CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DOM_GLYPH_COMPONENTS } from "@/components/riders/rider-symbol-glyph";
import { channelBadge, RIDER_FAMILY } from "@/components/riders/rider-plot-theme";
import { cn } from "@/lib/utils";

/** Payload used when dragging a gear tile onto the stage. */
export const RIDER_SYMBOL_MIME = "application/x-arbor-rider-symbol";

/** Room around the stage for the feet ruler. */
const PLOT_PADDING = 24;
/** The audience apron under the downstage edge. */
const APRON = 30;
const NUDGE_FT = 0.25;
const COARSE_NUDGE_FT = 1;
const ROTATE_SNAP_DEG = 15;
/** Dragged symbols land on a 6 in grid, so rows of gear line up; Alt places freely. */
const DRAG_SNAP_FT = 0.5;
const TOOLBAR_HEIGHT = 32;
const TOOLBAR_WIDTH = 128;

function snapFt(value: number): number {
  return Math.round(value / DRAG_SNAP_FT) * DRAG_SNAP_FT;
}

function wrapDegrees(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

/** Feet marks along the stage edges: every 4 ft, or 8 ft when that gets crowded. */
function rulerMarks(lengthFt: number, pxPerFt: number): number[] {
  const step = pxPerFt * 4 >= 28 ? 4 : 8;
  const marks: number[] = [];
  for (let ft = 0; ft <= lengthFt; ft += step) marks.push(ft);
  return marks;
}

type StagePlotCanvasProps = {
  content: RiderContent;
  selectedId?: string | null;
  onSelect?: (itemId: string | null) => void;
  onMoveItem?: (itemId: string, xFt: number, yFt: number) => void;
  onRotateItem?: (itemId: string, rotation: number) => void;
  onDeleteItem?: (itemId: string) => void;
  onDuplicateItem?: (itemId: string) => void;
  onDropSymbol?: (symbolKey: string, xFt: number, yFt: number) => void;
  readOnly?: boolean;
  className?: string;
  /** Fixed width for previews; otherwise the canvas fills its container. */
  fixedWidth?: number;
  /** Multiplies the fitted width; above 1 the plot scrolls and drags to pan. */
  zoom?: number;
  /** Channel and mix numbers on the gear that produces them. */
  showPatch?: boolean;
  /** Shown over an empty stage (e.g. starter layouts). */
  emptyState?: ReactNode;
};

export function StagePlotCanvas({
  content,
  selectedId = null,
  onSelect,
  onMoveItem,
  onRotateItem,
  onDeleteItem,
  onDuplicateItem,
  onDropSymbol,
  readOnly = false,
  className,
  fixedWidth,
  zoom = 1,
  showPatch = true,
  emptyState,
}: StagePlotCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(fixedWidth ?? 720);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useLayoutEffect(() => {
    if (fixedWidth) return;
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setMeasuredWidth(width);
    });
    observer.observe(element);
    setMeasuredWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [fixedWidth]);

  const zoomed = zoom > 1;
  const width = fixedWidth ?? Math.max(measuredWidth, 280) * zoom;
  const innerWidth = Math.max(width - PLOT_PADDING * 2, 1);
  const plotHeight =
    PLOT_PADDING * 2 +
    (innerWidth * Math.max(content.stage.depthFt, 1)) / Math.max(content.stage.widthFt, 1);
  const height = plotHeight + APRON;
  const layout = computePlotLayout(content.stage, { width, height: plotHeight, padding: PLOT_PADDING });
  const grid = gridLineOffsets(layout);
  const stage = layout.stage;
  const stageBottom = stage.top + stage.height;

  /** Channel and mix badges, keyed by the item that produces them. */
  const patch = useMemo(() => {
    const channels = new Map<string, Array<{ channel: number; stereo?: boolean }>>();
    for (const input of content.inputs) {
      if (!input.stageItemId) continue;
      const list = channels.get(input.stageItemId) ?? [];
      list.push(input);
      channels.set(input.stageItemId, list);
    }
    const mixes = new Map(content.monitorMixes.map((mix) => [mix.id, mix.mixNumber]));
    return { channels, mixes };
  }, [content.inputs, content.monitorMixes]);

  function pointerToFt(clientX: number, clientY: number) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return { xFt: 0, yFt: 0 };
    const ratio = box.width ? layout.width / box.width : 1;
    return pxToFt(layout, (clientX - box.left) * ratio, (clientY - box.top) * ratio);
  }

  const dragRef = useRef<{ itemId: string; offsetXFt: number; offsetYFt: number } | null>(null);
  /** Dragging empty stage while zoomed scrolls the plot; a tap without moving deselects. */
  const panRef = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
  } | null>(null);
  const onSelectRef = useRef(onSelect);
  const pointerToFtRef = useRef(pointerToFt);
  const contentRef = useRef(content);
  const onMoveItemRef = useRef(onMoveItem);

  useEffect(() => {
    pointerToFtRef.current = pointerToFt;
    contentRef.current = content;
    onMoveItemRef.current = onMoveItem;
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (readOnly) return;

    function handleMove(event: PointerEvent) {
      const pan = panRef.current;
      const wrapper = wrapperRef.current;
      if (pan && wrapper) {
        const dx = event.clientX - pan.x;
        const dy = event.clientY - pan.y;
        if (!pan.moved && Math.hypot(dx, dy) < 4) return;
        pan.moved = true;
        event.preventDefault();
        wrapper.scrollLeft = pan.scrollLeft - dx;
        wrapper.scrollTop = pan.scrollTop - dy;
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      const pointer = pointerToFtRef.current(event.clientX, event.clientY);
      const xFt = pointer.xFt + drag.offsetXFt;
      const yFt = pointer.yFt + drag.offsetYFt;
      const next = clampToStage(
        event.altKey ? { xFt, yFt } : { xFt: snapFt(xFt), yFt: snapFt(yFt) },
        contentRef.current.stage,
      );
      onMoveItemRef.current?.(drag.itemId, round(next.xFt), round(next.yFt));
    }

    function handleUp() {
      if (panRef.current && !panRef.current.moved) onSelectRef.current?.(null);
      panRef.current = null;
      dragRef.current = null;
    }

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [readOnly]);

  /**
   * `preventDefault` on pointerdown (so dragging doesn't select page text) also
   * suppresses focus, and without focus the keyboard shortcuts never fire.
   */
  function focusCanvas() {
    canvasRef.current?.focus({ preventScroll: true });
  }

  function beginMove(event: React.PointerEvent, item: RiderStageItem) {
    if (readOnly) {
      onSelect?.(item.id);
      return;
    }
    event.preventDefault();
    focusCanvas();
    onSelect?.(item.id);
    const pointer = pointerToFt(event.clientX, event.clientY);
    dragRef.current = {
      itemId: item.id,
      offsetXFt: item.xFt - pointer.xFt,
      offsetYFt: item.yFt - pointer.yFt,
    };
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (readOnly || !selectedId) return;
    const item = content.items.find((candidate) => candidate.id === selectedId);
    if (!item) return;
    const step = event.shiftKey ? COARSE_NUDGE_FT : NUDGE_FT;

    const move = (dx: number, dy: number) => {
      event.preventDefault();
      const next = clampToStage(
        { xFt: item.xFt + dx * step, yFt: item.yFt + dy * step },
        content.stage,
      );
      onMoveItem?.(item.id, round(next.xFt), round(next.yFt));
    };

    switch (event.key) {
      case "ArrowLeft":
        return move(-1, 0);
      case "ArrowRight":
        return move(1, 0);
      case "ArrowUp":
        return move(0, -1);
      case "ArrowDown":
        return move(0, 1);
      case "Delete":
      case "Backspace":
        event.preventDefault();
        return onDeleteItem?.(item.id);
      case "r":
      case "R":
        event.preventDefault();
        return onRotateItem?.(
          item.id,
          wrapDegrees(item.rotation + (event.shiftKey ? -ROTATE_SNAP_DEG : ROTATE_SNAP_DEG)),
        );
      case "d":
      case "D":
        if (!onDuplicateItem) return;
        event.preventDefault();
        return onDuplicateItem(item.id);
      case "Escape":
        return onSelect?.(null);
      default:
        return;
    }
  }

  function handleDrop(event: React.DragEvent) {
    if (readOnly) return;
    const symbolKey = event.dataTransfer.getData(RIDER_SYMBOL_MIME);
    setIsDraggingOver(false);
    if (!symbolKey) return;
    event.preventDefault();
    const pointer = pointerToFt(event.clientX, event.clientY);
    const next = clampToStage(pointer, content.stage);
    onDropSymbol?.(symbolKey, round(next.xFt), round(next.yFt));
  }

  const selectedItem = content.items.find((item) => item.id === selectedId) ?? null;

  // Zoomed in, keep the selected symbol on screen (e.g. picked from the list).
  const selectedRect = selectedItem ? itemRect(layout, selectedItem) : null;
  const selectedCx = selectedRect?.cx;
  const selectedCy = selectedRect?.cy;
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!zoomed || !wrapper || selectedCx === undefined || selectedCy === undefined) return;
    if (dragRef.current) return;
    const margin = 48;
    const visible =
      selectedCx > wrapper.scrollLeft + margin &&
      selectedCx < wrapper.scrollLeft + wrapper.clientWidth - margin &&
      selectedCy > wrapper.scrollTop + margin &&
      selectedCy < wrapper.scrollTop + wrapper.clientHeight - margin;
    if (visible) return;
    wrapper.scrollTo({
      left: selectedCx - wrapper.clientWidth / 2,
      top: selectedCy - wrapper.clientHeight / 2,
      behavior: "smooth",
    });
    // Only when the selection changes or the zoom does, not on every nudge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, zoom]);

  return (
    <div
      ref={wrapperRef}
      className={cn("relative w-full", zoomed && "max-h-[70vh] overflow-auto overscroll-contain", className)}
      onDragOver={(event) => {
        if (readOnly || !event.dataTransfer.types.includes(RIDER_SYMBOL_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDraggingOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setIsDraggingOver(false);
      }}
      onDrop={handleDrop}
    >
      <div
        ref={canvasRef}
        role={readOnly ? undefined : "application"}
        aria-label={readOnly ? undefined : "Stage plot"}
        tabIndex={readOnly ? undefined : 0}
        onKeyDown={handleKeyDown}
        className={cn("relative outline-none", !readOnly && "focus-visible:ring-2 focus-visible:ring-ring")}
        style={{ width, height }}
      >
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="touch-none"
          onPointerDown={(event) => {
            const wrapper = wrapperRef.current;
            if (!zoomed || !wrapper || readOnly) {
              onSelect?.(null);
              return;
            }
            panRef.current = {
              x: event.clientX,
              y: event.clientY,
              scrollLeft: wrapper.scrollLeft,
              scrollTop: wrapper.scrollTop,
              moved: false,
            };
          }}
        >
          {/* The audience apron, so the downstage edge reads as the front of the stage. */}
          <rect
            x={stage.left}
            y={stageBottom}
            width={stage.width}
            height={APRON - 4}
            className="fill-muted/60"
          />
          <rect
            x={stage.left}
            y={stage.top}
            width={stage.width}
            height={stage.height}
            className={cn("fill-card", isDraggingOver ? "stroke-primary" : "stroke-border")}
            strokeWidth={isDraggingOver ? 2 : 1}
          />
          {/* A dot at every grid crossing: enough to line gear up, quiet enough to ignore. */}
          {grid.vertical.flatMap((x) =>
            grid.horizontal.map((y) => (
              <circle key={`dot-${x}-${y}`} cx={x} cy={y} r={1.2} className="fill-foreground/20" />
            )),
          )}
          <line
            x1={stage.left + stage.width / 2}
            y1={stage.top}
            x2={stage.left + stage.width / 2}
            y2={stageBottom}
            className="stroke-foreground/10"
            strokeWidth={1}
            strokeDasharray="4 6"
          />
          <line
            x1={stage.left}
            y1={stageBottom}
            x2={stage.left + stage.width}
            y2={stageBottom}
            className="stroke-foreground/80"
            strokeWidth={3}
          />

          {plotDrawOrder(content.items).map((item) => {
            const rect = itemRect(layout, item);
            return (
              <g
                key={item.id}
                className={cn(readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing")}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginMove(event, item);
                }}
              >
                <StageSymbol item={item} rect={rect} selected={item.id === selectedId} />
                {/* Invisible hit area, at least thumb-sized, so small symbols stay easy to grab. */}
                <rect
                  x={rect.cx - Math.max(rect.width, 24) / 2}
                  y={rect.cy - Math.max(rect.height, 24) / 2}
                  width={Math.max(rect.width, 24)}
                  height={Math.max(rect.height, 24)}
                  fill="transparent"
                />
              </g>
            );
          })}
        </svg>

        {content.items.map((item) => {
          if (!item.label) return null;
          const rect = itemRect(layout, item);
          const label = labelRect(layout, rect, 14);
          const isSelected = item.id === selectedId;
          // A plate keeps labels readable where gear overlaps.
          return (
            <div
              key={`label-${item.id}`}
              className="pointer-events-none absolute flex justify-center"
              style={{ left: label.left, top: label.top, width: label.width, zIndex: isSelected ? 2 : 1 }}
            >
              <span
                className={cn(
                  "max-w-full truncate bg-card/85 px-0.5 text-center text-3xs leading-tight",
                  isSelected ? "font-semibold text-foreground" : "font-medium text-foreground/80",
                )}
              >
                {item.label}
              </span>
            </div>
          );
        })}

        {/* Risers and tables show their size, since that's what crew builds to. */}
        {content.items.map((item) => {
          const symbol = riderSymbol(item.symbol);
          if (!symbol.resizable) return null;
          const rect = itemRect(layout, item);
          if (rect.width < 48 || rect.height < 28) return null;
          const widthFt = item.widthFt ?? symbol.widthFt;
          const depthFt = item.depthFt ?? symbol.depthFt;
          return (
            <span
              key={`size-${item.id}`}
              aria-hidden
              className="pointer-events-none absolute text-right text-4xs tabular-nums text-muted-foreground"
              style={{ left: rect.x, top: rect.y + 4, width: rect.width - 6 }}
            >
              {widthFt} × {depthFt} ft
            </span>
          );
        })}

        {showPatch
          ? content.items.map((item) => {
              const channels = channelBadge(patch.channels.get(item.id) ?? []);
              const mix = item.monitorMixId ? patch.mixes.get(item.monitorMixId) : undefined;
              if (!channels && mix === undefined) return null;
              const rect = itemRect(layout, item);
              return (
                <div
                  key={`patch-${item.id}`}
                  className="pointer-events-none absolute flex -translate-x-1/2 gap-0.5"
                  style={{ left: rect.x + rect.width, top: rect.y - 6, zIndex: 3 }}
                >
                  {channels ? (
                    <span
                      className="bg-rider-input px-1 text-3xs leading-4 font-semibold text-background tabular-nums"
                      title={`Channel ${channels}`}
                    >
                      {channels}
                    </span>
                  ) : null}
                  {mix !== undefined ? (
                    <span
                      className="bg-rider-monitor px-1 text-3xs leading-4 font-semibold text-background tabular-nums"
                      title={`Monitor mix ${mix}`}
                    >
                      M{mix}
                    </span>
                  ) : null}
                </div>
              );
            })
          : null}

        {rulerMarks(content.stage.widthFt, layout.scale).map((ft) => (
          <span
            key={`ruler-x-${ft}`}
            aria-hidden
            className="pointer-events-none absolute w-8 -translate-x-1/2 text-center text-4xs tabular-nums text-muted-foreground"
            style={{ left: stage.left + ft * layout.scale, top: stage.top - 15 }}
          >
            {ft}′
          </span>
        ))}
        {/* The top ruler already marks 0 at the corner. */}
        {rulerMarks(content.stage.depthFt, layout.scale)
          .slice(1)
          .map((ft) => (
            <span
              key={`ruler-y-${ft}`}
              aria-hidden
              className="pointer-events-none absolute w-5 -translate-y-1/2 pr-1 text-right text-4xs tabular-nums text-muted-foreground"
              style={{ left: stage.left - 20, top: stage.top + ft * layout.scale }}
            >
              {ft}′
            </span>
          ))}

        <span
          className="pointer-events-none absolute text-4xs tracking-widest text-muted-foreground"
          style={{ left: stage.left + 6, top: stage.top + 5 }}
        >
          STAGE RIGHT
        </span>
        <span
          className="pointer-events-none absolute text-right text-4xs tracking-widest text-muted-foreground"
          style={{ left: stage.left, top: stage.top + 5, width: stage.width - 6 }}
        >
          STAGE LEFT
        </span>
        <span
          className="pointer-events-none absolute text-center text-4xs tracking-widest text-muted-foreground"
          style={{ left: stage.left, top: stage.top + 5, width: stage.width }}
        >
          UPSTAGE
        </span>
        <span
          className="pointer-events-none absolute text-center text-3xs font-semibold tracking-eyebrow text-muted-foreground"
          style={{ left: stage.left, top: stageBottom + 8, width: stage.width }}
        >
          AUDIENCE
        </span>

        {!readOnly && selectedItem ? (
          <SelectionToolbar
            item={selectedItem}
            layout={layout}
            onRotate={(delta) => onRotateItem?.(selectedItem.id, wrapDegrees(selectedItem.rotation + delta))}
            onDuplicate={onDuplicateItem ? () => onDuplicateItem(selectedItem.id) : undefined}
            onDelete={() => onDeleteItem?.(selectedItem.id)}
          />
        ) : null}

        {content.items.length === 0 && emptyState ? (
          <div
            className="absolute flex items-center justify-center p-4"
            style={{ left: stage.left, top: stage.top, width: stage.width, height: stage.height }}
          >
            {emptyState}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A symbol drawn from the shared artwork (the PDF draws the same shapes) in
 * its family colour, with a soft halo when selected.
 */
function StageSymbol({
  item,
  rect,
  selected,
}: {
  item: RiderStageItem;
  rect: ItemRect;
  selected: boolean;
}) {
  const symbol = riderSymbol(item.symbol);
  const glyph = itemGlyph(item);
  const family = RIDER_FAMILY[symbol.category];
  const rotation = itemTransform(rect, item.rotation);
  return (
    <>
      {selected ? (
        <g transform={rotation}>
          <rect
            x={rect.x - 4}
            y={rect.y - 4}
            width={rect.width + 8}
            height={rect.height + 8}
            className={cn("fill-transparent", family.stroke)}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </g>
      ) : null}
      {glyphNode({
        shapes: glyph.shapes,
        palette: family.paint,
        components: DOM_GLYPH_COMPONENTS,
        rect,
        glyphViewBox: glyph.glyphViewBox,
        preserveAspect: glyph.preserveAspect,
        rotationTransform: rotation,
        keyPrefix: item.id,
      })}
    </>
  );
}

/**
 * Actions for the selected symbol, floating above it (or below, near the top
 * edge). Big enough to hit with a thumb, unlike corner handles.
 */
function SelectionToolbar({
  item,
  layout,
  onRotate,
  onDuplicate,
  onDelete,
}: {
  item: RiderStageItem;
  layout: PlotLayout;
  onRotate: (deltaDegrees: number) => void;
  onDuplicate?: () => void;
  onDelete: () => void;
}) {
  const rect = itemRect(layout, item);
  // The symbol's furthest extent from its centre, so a rotated symbol is
  // never covered by its own toolbar.
  const reach = Math.hypot(rect.width, rect.height) / 2 + 8;
  const above = rect.cy - reach - TOOLBAR_HEIGHT;
  const top = above >= 0 ? above : Math.min(rect.cy + reach, layout.height - TOOLBAR_HEIGHT);
  const left = Math.min(Math.max(rect.cx - TOOLBAR_WIDTH / 2, 0), layout.width - TOOLBAR_WIDTH);
  const name = item.label || "symbol";

  return (
    <div
      role="toolbar"
      aria-label={`Actions for ${name}`}
      data-testid="stage-selection-toolbar"
      className="absolute z-10 flex items-center border bg-popover text-popover-foreground shadow-md"
      style={{ left, top, width: TOOLBAR_WIDTH, height: TOOLBAR_HEIGHT }}
      // Keep presses on the toolbar from reaching the stage, which deselects.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Rotate ${name} left`}
        title="Rotate left (Shift+R)"
        onClick={() => onRotate(-ROTATE_SNAP_DEG)}
      >
        <ArrowArcLeftIcon />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Rotate ${name} right`}
        title="Rotate right (R)"
        onClick={() => onRotate(ROTATE_SNAP_DEG)}
      >
        <ArrowArcRightIcon />
      </Button>
      {onDuplicate ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Duplicate ${name}`}
          title="Duplicate (D)"
          onClick={onDuplicate}
        >
          <CopyIcon />
        </Button>
      ) : null}
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-destructive"
        aria-label={`Remove ${name}`}
        title="Remove (Delete)"
        onClick={onDelete}
      >
        <TrashIcon />
      </Button>
    </div>
  );
}
