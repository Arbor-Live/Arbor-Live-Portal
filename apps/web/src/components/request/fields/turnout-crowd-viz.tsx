"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { createCrowdRenderer } from "./turnout-crowd-renderer";
import {
  DOM_DANCE_MAX,
  getPersonPosition,
  sceneHeightForCount,
  TURNOUT_VIZ_MAX,
} from "./turnout-layout";

type TurnoutCrowdVizProps = {
  count: number;
  energy: number;
};

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
  const dance = count <= DOM_DANCE_MAX && reducedMotion !== true;
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
  }, [dance, sway, bounce, phase, index]);

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
        className={cn("block rounded-full shadow-sm", sizeClass, dotColorClass(index, energy))}
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

function DomCrowd({
  count,
  energy,
  reducedMotion,
}: {
  count: number;
  energy: number;
  reducedMotion: boolean | null;
}) {
  return (
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
  );
}

function GpuCrowd({
  count,
  energy,
  reducedMotion,
  onFallback,
}: {
  count: number;
  energy: number;
  reducedMotion: boolean | null;
  onFallback: () => void;
}) {
  const crowdRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createCrowdRenderer> | null>(null);

  const stateRef = useRef({
    count,
    energy,
    animate: reducedMotion !== true,
  });
  const onFallbackRef = useRef(onFallback);

  useEffect(() => {
    onFallbackRef.current = onFallback;
  }, [onFallback]);

  useEffect(() => {
    stateRef.current = { count, energy, animate: reducedMotion !== true };
  }, [count, energy, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const crowd = crowdRef.current;
    if (!canvas || !crowd) return;

    let disposed = false;
    const renderer = createCrowdRenderer({ canvas, softFail: true });
    rendererRef.current = renderer;

    const syncSize = () => {
      renderer.setWidth(Math.max(1, Math.floor(crowd.clientWidth)));
      renderer.setState({
        count: stateRef.current.count,
        energy: stateRef.current.energy,
        animate: stateRef.current.animate,
        height: Math.max(1, Math.floor(crowd.clientHeight)),
      });
    };

    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            syncSize();
          });

    void renderer.ready.then(() => {
      if (disposed) return;
      if (!renderer.isWebGpu()) {
        onFallbackRef.current();
        return;
      }
      syncSize();
      observer?.observe(crowd);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const crowd = crowdRef.current;
    if (!crowd || !rendererRef.current?.isWebGpu()) return;
    rendererRef.current.setState({
      count,
      energy,
      animate: reducedMotion !== true,
      height: Math.max(1, Math.floor(crowd.clientHeight)),
    });
  }, [count, energy, reducedMotion]);

  return (
    <div ref={crowdRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 block size-full touch-none" aria-hidden />
    </div>
  );
}

export function TurnoutCrowdViz({ count, energy }: TurnoutCrowdVizProps) {
  const reducedMotion = useReducedMotion();
  const vizCount = Math.min(count, TURNOUT_VIZ_MAX);
  const sceneHeight = sceneHeightForCount(Math.max(vizCount, 1), energy);
  const [useGpu, setUseGpu] = useState(true);
  const handleGpuFallback = useCallback(() => setUseGpu(false), []);

  if (vizCount <= 0) {
    return (
      <p className="text-center text-xs text-muted-foreground">Enter a turnout to preview the crowd.</p>
    );
  }

  return (
    <div
      className="relative mx-auto w-full max-w-xs overflow-hidden"
      style={{ height: sceneHeight }}
    >
      <Stage energy={energy} reducedMotion={reducedMotion} />

      <div className="absolute inset-x-0 bottom-0 top-5 z-20">
        {useGpu ? (
          <GpuCrowd
            count={vizCount}
            energy={energy}
            reducedMotion={reducedMotion}
            onFallback={handleGpuFallback}
          />
        ) : (
          <DomCrowd count={vizCount} energy={energy} reducedMotion={reducedMotion} />
        )}
      </div>
    </div>
  );
}
