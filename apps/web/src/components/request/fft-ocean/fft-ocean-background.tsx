/**
 * Adapted from the vgpu “Particles ocean” example
 * https://vgpu.sh/examples/fft-ocean (MIT — vercel-labs/vgpu)
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { createRenderer } from "./renderer";
import { cn } from "@/lib/utils";

type FftOceanBackgroundProps = {
  className?: string;
};

/**
 * WebGPU FFT ocean background. Renders nothing useful when WebGPU is
 * unavailable or the user prefers reduced motion — the shell keeps a black fill.
 */
export function FftOceanBackground({ className }: FftOceanBackgroundProps) {
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
    let fadeFrame = 0;
    const renderer = createRenderer({ canvas, softFail: true });
    void renderer.ready
      .then(() => {
        if (disposed) return;
        // Wait two frames so the first painted ocean is ready before fading in.
        fadeFrame = requestAnimationFrame(() => {
          fadeFrame = requestAnimationFrame(() => {
            if (!disposed) setActive(true);
          });
        });
      })
      .catch(() => {
        // Keep the CSS fallback from RequestWizardShell.
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(fadeFrame);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      aria-hidden
      className={cn(
        "transition-opacity duration-[1600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        active ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
    </div>
  );
}
