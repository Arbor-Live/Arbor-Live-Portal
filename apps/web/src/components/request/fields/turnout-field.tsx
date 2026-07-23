"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getTurnoutTier, type BookingRequestFormValues } from "@/lib/validations/booking-request";

const TURNOUT_VIZ_MAX = 2000;

const ARC_START = Math.PI * 0.1;
const ARC_END = Math.PI * 0.9;
const SEMICIRCLE_ORIGIN_Y = 24;

function getTurnoutEnergy(count: number) {
  if (count < 50) return 1;
  if (count < 100) return 2;
  if (count < 200) return 3;
  return 4;
}

function rowCapacity(row: number) {
  return 7 + row * 5;
}

function rowsNeededForCount(count: number) {
  let remaining = count;
  let rows = 0;
  while (remaining > 0) {
    remaining -= rowCapacity(rows);
    rows += 1;
  }
  return rows;
}

/** Fixed slot per index — fills a semicircular crowd in rows facing the stage. */
function getPersonPosition(index: number, energy: number) {
  let remaining = index;
  let row = 0;

  while (true) {
    const capacity = rowCapacity(row);
    if (remaining < capacity) {
      const t = capacity <= 1 ? 0.5 : remaining / (capacity - 1);
      const angle = ARC_START + t * (ARC_END - ARC_START);
      const radius = 18 + row * 12 + energy * 2.5;

      return {
        x: Math.cos(angle) * radius,
        y: SEMICIRCLE_ORIGIN_Y + Math.sin(angle) * radius * 0.72,
      };
    }
    remaining -= capacity;
    row += 1;
  }
}

function dotSizeClass(count: number) {
  if (count > 200) return "size-1";
  if (count > 80) return "size-1.5";
  return "size-2.5";
}

function dotOffset(count: number) {
  if (count > 200) return 2;
  if (count > 80) return 3;
  return 5;
}

function dotColorClass(index: number, energy: number) {
  if (energy >= 4) {
    return index % 3 === 0 ? "bg-amber-500" : index % 3 === 1 ? "bg-primary" : "bg-orange-400";
  }
  if (energy >= 3) {
    return index % 2 === 0 ? "bg-primary" : "bg-primary/70";
  }
  return "bg-primary";
}

function PersonDot({
  index,
  count,
  energy,
  reducedMotion,
}: {
  index: number;
  count: number;
  energy: number;
  reducedMotion: boolean | null;
}) {
  const { x, y } = getPersonPosition(index, energy);
  const bounce = 2 + energy * 0.5;
  const sway = 1 + energy * 0.4;
  const phase = index * 0.31;
  const dance = count <= 150 && reducedMotion !== true;
  const sizeClass = dotSizeClass(count);
  const offset = dotOffset(count);
  const dotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!dance || !dotRef.current) return;

    const element = dotRef.current;
    const durationMs = (0.8 + (index % 4) * 0.1) * 1000;
    const delayMs = phase * 0.07 * 1000;
    const animation = element.animate(
      [
        { transform: "translate(0px, 0px)" },
        { transform: `translate(${sway}px, ${-bounce}px)` },
        { transform: `translate(${-sway * 0.5}px, ${bounce * 0.2}px)` },
        { transform: `translate(${sway * 0.35}px, ${-bounce * 0.55}px)` },
        { transform: "translate(0px, 0px)" },
      ],
      {
        duration: durationMs,
        delay: delayMs,
        iterations: Infinity,
        easing: "ease-in-out",
      },
    );

    return () => animation.cancel();
  }, [dance, sway, bounce, phase, index, count]);

  return (
    <motion.span
      className="absolute"
      style={{ left: "50%", top: 0, marginLeft: -offset, marginTop: -offset, x, y }}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.5 }}
      animate={{ opacity: 0.92, scale: 1 }}
      exit={
        reducedMotion
          ? undefined
          : {
              opacity: 0,
              scale: 0.5,
              transition: { duration: 0.22, ease: "easeIn" },
            }
      }
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 28,
        opacity: { duration: 0.18 },
      }}
    >
      <span
        ref={dotRef}
        className={cn(
          "block rounded-full shadow-sm",
          sizeClass,
          dotColorClass(index, energy),
        )}
      />
    </motion.span>
  );
}

function SoundRipple({
  index,
  total,
  energy,
  reducedMotion,
}: {
  index: number;
  total: number;
  energy: number;
  reducedMotion: boolean | null;
}) {
  const maxSize = 36 + energy * 14;
  const cycle = 2.2 + energy * 0.12;

  return (
    <motion.span
      className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/40"
      initial={reducedMotion ? false : { width: 6, height: 6, opacity: 0.5 }}
      animate={
        reducedMotion
          ? { width: maxSize * 0.4, height: maxSize * 0.4, opacity: 0.15 }
          : { width: maxSize, height: maxSize, opacity: 0 }
      }
      transition={
        reducedMotion
          ? { duration: 0.3 }
          : {
              duration: cycle,
              repeat: Infinity,
              ease: "easeOut",
              delay: (index / total) * cycle,
            }
      }
    />
  );
}

function Speaker({
  side,
  energy,
  reducedMotion,
}: {
  side: "left" | "right";
  energy: number;
  reducedMotion: boolean | null;
}) {
  const rippleCount = 2 + Math.min(energy, 2);

  return (
    <div
      className={cn(
        "absolute top-0.5",
        side === "left" ? "right-full mr-1" : "left-full ml-1",
      )}
      aria-hidden
    >
      <div className="relative">
        <div className="relative z-10 size-2.5 shrink-0 rounded-[3px] border border-primary/30 bg-primary/75 shadow-sm" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 size-0">
          {Array.from({ length: rippleCount }).map((_, index) => (
            <SoundRipple
              key={index}
              index={index}
              total={rippleCount}
              energy={energy}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stage({ energy, reducedMotion }: { energy: number; reducedMotion: boolean | null }) {
  const stageWidth = 52 + energy * 16;

  return (
    <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2" aria-hidden>
      <div className="relative flex flex-col items-center">
        <div className="relative">
          <Speaker side="left" energy={energy} reducedMotion={reducedMotion} />
          <motion.div
            className="rounded-sm bg-primary shadow-sm"
            style={{ width: stageWidth, height: 7 }}
            animate={reducedMotion ? undefined : { scaleY: [1, 1.05, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <Speaker side="right" energy={energy} reducedMotion={reducedMotion} />
        </div>
        <div className="flex w-full justify-between px-1.5" style={{ width: stageWidth }}>
          <div className="h-2.5 w-0.5 rounded-full bg-primary/45" />
          <div className="h-2.5 w-0.5 rounded-full bg-primary/45" />
        </div>
      </div>
    </div>
  );
}

function StageScene({
  count,
  energy,
  reducedMotion,
}: {
  count: number;
  energy: number;
  reducedMotion: boolean | null;
}) {
  const rows = rowsNeededForCount(count);
  const sceneHeight = 58 + rows * 15 + energy * 12;

  return (
    <div className="relative mx-auto w-full max-w-xs overflow-hidden" style={{ height: sceneHeight }}>
      <Stage energy={energy} reducedMotion={reducedMotion} />

      <div className="absolute inset-x-0 bottom-0 top-5 z-20">
        <AnimatePresence mode="popLayout">
          {Array.from({ length: count }).map((_, index) => (
            <PersonDot
              key={`turnout-dot-${index}`}
              index={index}
              count={count}
              energy={energy}
              reducedMotion={reducedMotion}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function TurnoutField() {
  const reducedMotion = useReducedMotion();
  const { register, watch, getFieldState } = useFormContext<BookingRequestFormValues>();
  const raw = watch("expectedTurnout");
  const count = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const vizCount = Math.min(count, TURNOUT_VIZ_MAX);
  const tier = getTurnoutTier(count || 1);
  const energy = getTurnoutEnergy(count || 1);
  const error = getFieldState("expectedTurnout").error?.message;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="expectedTurnout">Expected turnout</Label>
        <Input
          id="expectedTurnout"
          type="number"
          min={1}
          aria-invalid={Boolean(error)}
          {...register("expectedTurnout", { valueAsNumber: true })}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-md border bg-muted/20 p-4"
      >
        <p className="text-sm font-medium">{tier.label}</p>
        <p className="text-xs text-muted-foreground">{tier.description}</p>

        <div className="mt-3 py-1">
          {count > 0 ? (
            <StageScene count={vizCount} energy={energy} reducedMotion={reducedMotion} />
          ) : (
            <p className="text-center text-xs text-muted-foreground">Enter a turnout to preview the crowd.</p>
          )}
        </div>

        {count > TURNOUT_VIZ_MAX ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Crowd preview capped at {TURNOUT_VIZ_MAX.toLocaleString()} dots. Your entered turnout (
            {count.toLocaleString()}) is still saved.
          </p>
        ) : null}

        {count >= 200 ? (
          <p className="mt-1 text-xs text-amber-700">
            Campus sensation territory. We&apos;ll reach out with extra coordination after you submit.
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}
