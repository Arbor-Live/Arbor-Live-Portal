/**
 * Arbor logo with volumetric rim flare.
 * Adapted from https://vgpu.sh/examples/nextjs-flare (MIT — vercel-labs/vgpu)
 */
"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CANVAS_OVERSCAN } from "./pipeline";
import { createRenderer } from "./renderer";
import { cn } from "@/lib/utils";

/** Same footprint as the static `/icon.svg` in the hero. */
export const LOGO_MARK_CLASSNAME =
  "h-24 w-auto aspect-[307/408] sm:h-28 md:h-32 lg:h-36";

type LogoFlareMarkProps = {
  className?: string;
};

/**
 * WebGPU logo flare for the hero mark. Layout box matches the static icon;
 * canvas is overscanned so the white rim isn't clipped. Static `/icon.svg`
 * until ready.
 */
export function LogoFlareMark({ className }: LogoFlareMarkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("gpu" in navigator)) return;

    let disposed = false;
    let fadeFrame = 0;
    const renderer = createRenderer({ canvas, softFail: true });
    void renderer.ready
      .then(() => {
        if (disposed) return;
        fadeFrame = requestAnimationFrame(() => {
          fadeFrame = requestAnimationFrame(() => {
            if (!disposed) setActive(true);
          });
        });
      })
      .catch(() => {
        // Keep the static icon.
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(fadeFrame);
      renderer.dispose();
    };
  }, []);

  const overscanPercent = `${CANVAS_OVERSCAN * 100}%`;

  return (
    <div
      aria-hidden
      className={cn("relative overflow-visible", LOGO_MARK_CLASSNAME, className)}
    >
      <Image
        src="/icon.svg"
        alt=""
        width={307}
        height={408}
        className={cn(
          "absolute inset-0 size-full object-contain transition-opacity duration-700",
          active ? "opacity-0" : "opacity-100",
        )}
        priority
      />
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute left-1/2 top-1/2 block max-w-none -translate-x-1/2 -translate-y-1/2 touch-none transition-opacity duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          active ? "opacity-100" : "opacity-0",
        )}
        style={{ width: overscanPercent, height: overscanPercent }}
      />
    </div>
  );
}
