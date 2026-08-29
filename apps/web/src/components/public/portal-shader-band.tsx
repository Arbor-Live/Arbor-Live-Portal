/**
 * Lightweight fullscreen fragment shader for portal chrome accents.
 * Inspired by https://vgpu.sh/examples/gradient — retinted to Arbor green + time.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type PortalShaderBandProps = {
  className?: string;
};

export function PortalShaderBand({ className }: PortalShaderBandProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof navigator === "undefined" || !("gpu" in navigator)) {
      return;
    }

    let disposed = false;
    let disposeRenderer: (() => void) | undefined;

    void (async () => {
      try {
        const { init, effect, frameLoop, surface, clock } = await import("vgpu");
        const fragment = (await import("./portal-band.wgsl")).default;
        if (disposed) return;
        const gpu = await init();
        if (disposed) {
          gpu.dispose();
          return;
        }
        const output = surface(gpu, canvas, { dpr: [1, 1.5] });
        const shader = effect(gpu, fragment);
        const time = clock(gpu);
        const loop = frameLoop(gpu, (frame) => {
          shader.set({ u: { time: time.time } });
          frame.pass(output, shader);
        });
        disposeRenderer = () => {
          loop.stop();
          output.dispose();
          gpu.dispose();
        };
        if (!disposed) setActive(true);
      } catch {
        // Keep CSS radial fallback on PublicPageHero.
      }
    })();

    return () => {
      disposed = true;
      disposeRenderer?.();
    };
  }, []);

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-0 h-40 overflow-hidden sm:h-52",
        "transition-opacity duration-1000 ease-out",
        active ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background dark:to-zinc-950" />
    </div>
  );
}
