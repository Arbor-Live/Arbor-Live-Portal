"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const FftOceanBackground = dynamic(
  () =>
    import("@/components/request/fft-ocean/fft-ocean-background").then(
      (mod) => mod.FftOceanBackground,
    ),
  { ssr: false },
);

const spring = { type: "spring" as const, stiffness: 380, damping: 36 };

const GRID_STYLE: React.CSSProperties = {
  backgroundImage: [
    "linear-gradient(to right, color-mix(in oklch, var(--foreground) 11%, transparent) 1px, transparent 1px)",
    "linear-gradient(to bottom, color-mix(in oklch, var(--foreground) 11%, transparent) 1px, transparent 1px)",
  ].join(", "),
  backgroundSize: "3.5rem 3.5rem",
};

type RequestWizardShellProps = {
  eyebrow: string;
  meta?: string;
  progressPercent?: number;
  progress?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Booking request uses the WebGPU FFT ocean; other wizards keep the grid. */
  background?: "grid" | "fft-ocean";
};

export function RequestWizardShell({
  eyebrow,
  meta,
  progressPercent = 0,
  progress,
  children,
  footer,
  className,
  background = "grid",
}: RequestWizardShellProps) {
  const ocean = background === "fft-ocean";

  return (
    <div
      className={cn(
        "relative flex min-h-dvh flex-1 flex-col overflow-hidden",
        ocean && "bg-black",
        className,
      )}
    >
      {ocean ? (
        <>
          <FftOceanBackground className="pointer-events-none absolute inset-0 z-0" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,transparent_20%,rgba(0,0,0,0.55)_100%)]"
          />
        </>
      ) : (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_16%,transparent),transparent)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 opacity-40"
            style={GRID_STYLE}
          />
        </>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col pt-[5.5rem] sm:pt-24">
        <div className="px-4 sm:px-5">
          <div className="mx-auto max-w-2xl border border-border/40 bg-background/75 px-4 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md sm:px-5">
            <p className="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/65">
              {eyebrow}
            </p>
            {meta ? (
              <p className="mt-0.5 text-center text-[11px] text-foreground/50">{meta}</p>
            ) : null}
            {progress ?? (
              <div className="mt-2 h-0.5 overflow-hidden bg-foreground/10">
                <motion.div
                  className="h-full bg-primary"
                  initial={false}
                  animate={{ width: `${progressPercent}%` }}
                  transition={spring}
                />
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
          {children}
        </div>

        {footer ? (
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="mx-auto max-w-2xl border border-border/40 bg-background/75 px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md sm:px-5">
              {footer}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
