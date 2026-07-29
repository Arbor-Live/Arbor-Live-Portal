"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  clampToStage,
  computePlotLayout,
  glyphNode,
  gridLineOffsets,
  itemRect,
  itemTransform,
  labelRect,
  PLOT_COLORS,
  pxToFt,
  RIDER_CATEGORY_PALETTE,
  riderSymbol,
  round,
} from "@arbor/rider-document";
import type { PlotLayout, RiderContent, RiderStageItem } from "@arbor/rider-document";
import { ArrowsClockwiseIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { DOM_GLYPH_COMPONENTS } from "@/components/riders/rider-symbol-glyph";

/** Payload used when dragging a palette chip onto the stage. */
export const RIDER_SYMBOL_MIME = "application/x-arbor-rider-symbol";

const PLOT_PADDING = 22;
const NUDGE_FT = 0.25;
const COARSE_NUDGE_FT = 1;
const ROTATE_SNAP_DEG = 15;

type StagePlotCanvasProps = {
  content: RiderContent;
  selectedId?: string | null;
  onSelect?: (itemId: string | null) => void;
  onMoveItem?: (itemId: string, xFt: number, yFt: number) => void;
  onRotateItem?: (itemId: string, rotation: number) => void;
  onDeleteItem?: (itemId: string) => void;
  onDropSymbol?: (symbolKey: string, xFt: number, yFt: number) => void;
  readOnly?: boolean;
  className?: string;
  /** Fixed width for previews; otherwise the canvas fills its container. */
  fixedWidth?: number;
};

export function StagePlotCanvas({
  content,
  selectedId = null,
  onSelect,
  onMoveItem,
  onRotateItem,
  onDeleteItem,
  onDropSymbol,
  readOnly = false,
  className,
  fixedWidth,
}: StagePlotCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
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

  const width = fixedWidth ?? Math.max(measuredWidth, 280);
  const innerWidth = Math.max(width - PLOT_PADDING * 2, 1);
  const height =
    PLOT_PADDING * 2 +
    (innerWidth * Math.max(content.stage.depthFt, 1)) / Math.max(content.stage.widthFt, 1);
  const layout = computePlotLayout(content.stage, { width, height, padding: PLOT_PADDING });
  const grid = gridLineOffsets(layout);
  const stage = layout.stage;

  const pointerToFt = useCallback(
    (clientX: number, clientY: number) => {
      const box = svgRef.current?.getBoundingClientRect();
      if (!box) return { xFt: 0, yFt: 0 };
      const ratio = box.width ? layout.width / box.width : 1;
      return pxToFt(layout, (clientX - box.left) * ratio, (clientY - box.top) * ratio);
    },
    [layout],
  );

  const dragRef = useRef<
    | { mode: "move"; itemId: string; offsetXFt: number; offsetYFt: number }
    | { mode: "rotate"; itemId: string }
    | null
  >(null);

  useEffect(() => {
    if (readOnly) return;

    function handleMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      const pointer = pointerToFt(event.clientX, event.clientY);

      if (drag.mode === "move") {
        const next = clampToStage(
          { xFt: pointer.xFt + drag.offsetXFt, yFt: pointer.yFt + drag.offsetYFt },
          content.stage,
        );
        onMoveItem?.(drag.itemId, round(next.xFt), round(next.yFt));
        return;
      }

      const item = content.items.find((candidate) => candidate.id === drag.itemId);
      if (!item) return;
      const degrees =
        (Math.atan2(pointer.yFt - item.yFt, pointer.xFt - item.xFt) * 180) / Math.PI + 90;
      const snapped =
        Math.round(degrees / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
      onRotateItem?.(drag.itemId, ((snapped % 360) + 360) % 360);
    }

    function handleUp() {
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
  }, [content.items, content.stage, onMoveItem, onRotateItem, pointerToFt, readOnly]);

  function beginMove(event: React.PointerEvent, item: RiderStageItem) {
    if (readOnly) return;
    event.preventDefault();
    onSelect?.(item.id);
    const pointer = pointerToFt(event.clientX, event.clientY);
    dragRef.current = {
      mode: "move",
      itemId: item.id,
      offsetXFt: item.xFt - pointer.xFt,
      offsetYFt: item.yFt - pointer.yFt,
    };
  }

  function beginRotate(event: React.PointerEvent, item: RiderStageItem) {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(item.id);
    dragRef.current = { mode: "rotate", itemId: item.id };
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
        return onRotateItem?.(item.id, (item.rotation + ROTATE_SNAP_DEG) % 360);
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

  return (
    <div
      ref={wrapperRef}
      className={cn("relative w-full", className)}
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
        role={readOnly ? undefined : "application"}
        aria-label={readOnly ? undefined : "Stage plot"}
        tabIndex={readOnly ? undefined : 0}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative outline-none",
          !readOnly && "focus-visible:ring-2 focus-visible:ring-ring",
        )}
        style={{ width, height }}
      >
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className={cn("touch-none", isDraggingOver && "opacity-90")}
          onPointerDown={() => onSelect?.(null)}
        >
          <rect
            x={stage.left}
            y={stage.top}
            width={stage.width}
            height={stage.height}
            fill={PLOT_COLORS.stageFill}
            stroke={isDraggingOver ? "#2563eb" : PLOT_COLORS.stageBorder}
            strokeWidth={isDraggingOver ? 2.5 : 1.2}
          />
          {grid.vertical.map((x) => (
            <line
              key={`v-${x}`}
              x1={x}
              y1={stage.top}
              x2={x}
              y2={stage.top + stage.height}
              stroke={PLOT_COLORS.grid}
              strokeWidth={1}
            />
          ))}
          {grid.horizontal.map((y) => (
            <line
              key={`h-${y}`}
              x1={stage.left}
              y1={y}
              x2={stage.left + stage.width}
              y2={y}
              stroke={PLOT_COLORS.grid}
              strokeWidth={1}
            />
          ))}
          <line
            x1={stage.left}
            y1={stage.top + stage.height}
            x2={stage.left + stage.width}
            y2={stage.top + stage.height}
            stroke={PLOT_COLORS.audienceBar}
            strokeWidth={4}
          />

          {content.items.map((item) => {
            const symbol = riderSymbol(item.symbol);
            const rect = itemRect(layout, item);
            const rotation = itemTransform(rect, item.rotation);
            const isSelected = item.id === selectedId;
            return (
              <g
                key={item.id}
                className={cn(!readOnly && "cursor-grab")}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginMove(event, item);
                }}
              >
                {isSelected ? (
                  <g transform={rotation}>
                    <rect
                      x={rect.x - 4}
                      y={rect.y - 4}
                      width={rect.width + 8}
                      height={rect.height + 8}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                    />
                  </g>
                ) : null}
                {glyphNode({
                  shapes: symbol.shapes,
                  palette: RIDER_CATEGORY_PALETTE[symbol.category],
                  components: DOM_GLYPH_COMPONENTS,
                  rect,
                  rotationTransform: rotation,
                  keyPrefix: item.id,
                })}
                {/* Invisible hit area so thin glyphs stay easy to grab. */}
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  fill="transparent"
                />
              </g>
            );
          })}
        </svg>

        {content.items.map((item) => {
          const rect = itemRect(layout, item);
          const label = labelRect(layout, rect, 14);
          return (
            <div
              key={`label-${item.id}`}
              className="pointer-events-none absolute truncate text-center text-[10px] leading-tight font-medium text-slate-900"
              style={{ left: label.left, top: label.top, width: label.width }}
            >
              {item.label}
            </div>
          );
        })}

        <span
          className="pointer-events-none absolute text-[9px] tracking-widest text-slate-500"
          style={{ left: stage.left + 6, top: stage.top + 5 }}
        >
          STAGE RIGHT
        </span>
        <span
          className="pointer-events-none absolute text-right text-[9px] tracking-widest text-slate-500"
          style={{ left: stage.left, top: stage.top + 5, width: stage.width - 6 }}
        >
          STAGE LEFT
        </span>
        <span
          className="pointer-events-none absolute text-center text-[9px] tracking-widest text-slate-500"
          style={{ left: stage.left, top: stage.top + 5, width: stage.width }}
        >
          UPSTAGE · {content.stage.widthFt} × {content.stage.depthFt} FT
        </span>
        <span
          className="pointer-events-none absolute text-center text-[10px] font-semibold tracking-[0.2em] text-slate-900"
          style={{ left: stage.left, top: stage.top + stage.height + 5, width: stage.width }}
        >
          AUDIENCE
        </span>

        {!readOnly && selectedItem ? (
          <SelectionControls
            item={selectedItem}
            layout={layout}
            onRotateStart={(event) => beginRotate(event, selectedItem)}
            onDelete={() => onDeleteItem?.(selectedItem.id)}
          />
        ) : null}

        {!readOnly && content.items.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="max-w-xs text-center text-sm text-slate-500">
              Drag symbols from the palette onto the stage, or pick a starter layout.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SelectionControls({
  item,
  layout,
  onRotateStart,
  onDelete,
}: {
  item: RiderStageItem;
  layout: PlotLayout;
  onRotateStart: (event: React.PointerEvent) => void;
  onDelete: () => void;
}) {
  const rect = itemRect(layout, item);

  return (
    <>
      <button
        type="button"
        aria-label={`Rotate ${item.label}`}
        title="Drag to rotate"
        onPointerDown={onRotateStart}
        className="absolute flex size-6 cursor-grab items-center justify-center rounded-full border border-blue-600 bg-white text-blue-700 shadow-sm"
        style={{ left: rect.cx - 12, top: rect.y - 30 }}
      >
        <ArrowsClockwiseIcon className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`Remove ${item.label}`}
        title="Remove from plot"
        onClick={onDelete}
        className="absolute flex size-6 items-center justify-center rounded-full border border-destructive bg-white text-destructive shadow-sm"
        style={{ left: rect.x + rect.width + 4, top: rect.y - 12 }}
      >
        <XIcon className="size-3.5" />
      </button>
    </>
  );
}
