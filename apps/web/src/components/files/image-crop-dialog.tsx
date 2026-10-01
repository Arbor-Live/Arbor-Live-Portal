"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  IMAGE_UPLOAD_MAX_BYTES,
  MAX_OUTPUT_EDGE,
  POSTER_ASPECT_RATIO,
  aspectRatioLabel,
  drawWithWhiteMatte,
  encodeUnderLimit,
  jpegFileName,
  loadImageElement,
} from "@/lib/image-processing";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Offset = { x: number; y: number };
type Size = { w: number; h: number };

type ImageCropDialogProps = {
  open: boolean;
  file: File | null;
  aspect?: number;
  title?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

export function ImageCropDialog({
  open,
  file,
  aspect = POSTER_ASPECT_RATIO,
  title = "Crop image",
  description,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  return (
    <Dialog
      open={open && Boolean(file)}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {file ? (
          <CropSurface
            key={`${file.name}:${file.size}:${file.lastModified}`}
            file={file}
            aspect={aspect}
            title={title}
            description={description}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CropSurface({
  file,
  aspect,
  title,
  description,
  onCancel,
  onConfirm,
}: {
  file: File;
  aspect: number;
  title: string;
  description?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: Offset;
  } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create and revoke the object URL inside one effect so Strict Mode's
  // mount→cleanup→mount cycle always leaves a live URL behind. Creating it in
  // a useState initializer would let the cleanup revoke the URL React keeps.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URLs are an external resource; the effect owns its lifecycle
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setFrame({ w: rect.width, h: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const coverScale =
    frame && natural && natural.w > 0 && natural.h > 0
      ? Math.max(frame.w / natural.w, frame.h / natural.h)
      : 1;
  const totalScale = coverScale * zoom;

  const clampOffset = useCallback(
    (value: Offset, scale: number): Offset => {
      if (!frame || !natural || natural.w <= 0 || natural.h <= 0) return { x: 0, y: 0 };
      const displayedW = natural.w * scale;
      const displayedH = natural.h * scale;
      const minX = Math.min(0, frame.w - displayedW);
      const minY = Math.min(0, frame.h - displayedH);
      return {
        x: Math.max(minX, Math.min(0, value.x)),
        y: Math.max(minY, Math.min(0, value.y)),
      };
    },
    [frame, natural],
  );

  const centeredOffset: Offset =
    frame && natural
      ? {
          x: (frame.w - natural.w * totalScale) / 2,
          y: (frame.h - natural.h * totalScale) / 2,
        }
      : { x: 0, y: 0 };
  const displayOffset = clampOffset(offset ?? centeredOffset, totalScale);

  const applyZoom = useCallback(
    (next: number) => {
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      setZoom(clamped);
      setOffset((current) => {
        const scale = coverScale * clamped;
        const base = current ?? {
          x: (frame?.w ?? 0) / 2 - ((natural?.w ?? 0) * scale) / 2,
          y: (frame?.h ?? 0) / 2 - ((natural?.h ?? 0) * scale) / 2,
        };
        return clampOffset(base, scale);
      });
    },
    [clampOffset, coverScale, frame, natural],
  );

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      applyZoom(zoom - event.deltaY * 0.0015);
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [applyZoom, zoom]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (working) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: displayOffset,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(
      clampOffset(
        {
          x: drag.origin.x + (event.clientX - drag.startX),
          y: drag.origin.y + (event.clientY - drag.startY),
        },
        totalScale,
      ),
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const handleConfirm = async () => {
    if (!imageUrl || !natural || !frame || natural.w <= 0 || natural.h <= 0) return;
    setWorking(true);
    setError(null);
    try {
      const scale = totalScale;
      const cropW = frame.w / scale;
      const cropH = frame.h / scale;
      const sx = Math.max(0, Math.min(natural.w - cropW, -displayOffset.x / scale));
      const sy = Math.max(0, Math.min(natural.h - cropH, -displayOffset.y / scale));

      const image = await loadImageElement(imageUrl);
      let outW = Math.min(Math.max(1, Math.round(cropW)), MAX_OUTPUT_EDGE);
      let outH = Math.round(outW / aspect);
      if (outH > MAX_OUTPUT_EDGE) {
        outH = MAX_OUTPUT_EDGE;
        outW = Math.round(outH * aspect);
      }

      const canvas = document.createElement("canvas");
      drawWithWhiteMatte(canvas, image, { sx, sy, sw: cropW, sh: cropH }, outW, outH);
      const blob = await encodeUnderLimit(canvas, IMAGE_UPLOAD_MAX_BYTES, "image/jpeg");
      onConfirm(
        new File([blob], jpegFileName(file.name), {
          type: "image/jpeg",
          lastModified: file.lastModified,
        }),
      );
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "Could not crop that image.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {description ? `${description} ` : ""}Framed to {aspectRatioLabel(aspect)}. Drag to
          reposition and zoom in; a source already in this shape loses nothing.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div
          ref={frameRef}
          className="relative mx-auto w-full max-w-full overflow-hidden rounded-lg bg-muted"
          style={{ aspectRatio: aspect }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
            src={imageUrl}
            alt=""
            draggable={false}
            onLoad={(event) =>
              setNatural({
                w: event.currentTarget.naturalWidth,
                h: event.currentTarget.naturalHeight,
              })
            }
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute top-0 left-0 max-w-none cursor-grab touch-none select-none active:cursor-grabbing"
            style={{
              width: natural ? natural.w * totalScale : undefined,
              height: natural ? natural.h * totalScale : undefined,
              transform: `translate(${displayOffset.x}px, ${displayOffset.y}px)`,
            }}
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 ring-1 ring-foreground/15 ring-inset">
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="border border-white/35" />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="shrink-0 text-xs text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={working}
            onChange={(event) => applyZoom(Number(event.target.value))}
            className="h-1 w-full cursor-pointer accent-primary"
            aria-label="Zoom"
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={working} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={working || !natural} onClick={() => void handleConfirm()}>
          {working ? "Preparing…" : "Use this crop"}
        </Button>
      </DialogFooter>
    </>
  );
}
