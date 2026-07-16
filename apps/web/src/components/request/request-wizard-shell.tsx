"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const spring = { type: "spring" as const, stiffness: 380, damping: 36 };

const GRID_STYLE = {
  backgroundImage: [
    "linear-gradient(to right, color-mix(in oklch, var(--foreground) 12%, transparent) 1px, transparent 1px)",
    "linear-gradient(to bottom, color-mix(in oklch, var(--foreground) 12%, transparent) 1px, transparent 1px)",
  ].join(", "),
  backgroundSize: "3.5rem 3.5rem",
} as const;

const GLOW_GRID_STYLE = {
  backgroundImage: [
    "linear-gradient(to right, color-mix(in oklch, var(--color-primary) 55%, transparent) 1px, transparent 1px)",
    "linear-gradient(to bottom, color-mix(in oklch, var(--color-primary) 55%, transparent) 1px, transparent 1px)",
  ].join(", "),
  backgroundSize: "3.5rem 3.5rem",
} as const;

type RequestWizardShellProps = {
  eyebrow: string;
  meta?: string;
  progressPercent: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function RequestWizardShell({
  eyebrow,
  meta,
  progressPercent,
  children,
  footer,
  className,
}: RequestWizardShellProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "relative flex min-h-dvh flex-1 flex-col overflow-hidden",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_18%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-45"
        style={GRID_STYLE}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-60"
        style={{
          ...GLOW_GRID_STYLE,
          maskImage:
            "radial-gradient(ellipse 50% 38% at 50% 50%, #000 0%, rgb(0 0 0 / 0.45) 35%, transparent 72%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 50% 38% at 50% 50%, #000 0%, rgb(0 0 0 / 0.45) 35%, transparent 72%)",
          maskSize: "180% 180%",
          WebkitMaskSize: "180% 180%",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
        initial={false}
        animate={
          reduceMotion
            ? { maskPosition: "50% 40%", WebkitMaskPosition: "50% 40%" }
            : {
                maskPosition: ["0% 15%", "100% 85%"],
                WebkitMaskPosition: ["0% 15%", "100% 85%"],
              }
        }
        transition={
          reduceMotion
            ? undefined
            : { duration: 26, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }
        }
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col pt-[5.5rem] sm:pt-24">
        <div className="px-4 sm:px-5">
          <div className="mx-auto max-w-2xl border border-border/40 bg-background/75 px-4 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md sm:px-5">
            <p className="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/65">
              {eyebrow}
            </p>
            {meta ? (
              <p className="mt-0.5 text-center text-[11px] text-foreground/50">{meta}</p>
            ) : null}
            <div className="mt-2 h-0.5 overflow-hidden bg-foreground/10">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${progressPercent}%` }}
                transition={spring}
              />
            </div>
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
