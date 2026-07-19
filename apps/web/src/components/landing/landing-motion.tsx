"use client";

import { motion, useInView, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export const landingSpring = { type: "spring" as const, stiffness: 380, damping: 36 };
export const landingSpringBouncy = { type: "spring" as const, stiffness: 420, damping: 22 };

const landingTween: Transition = {
  type: "tween",
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
};

function subscribeCoarsePointer(onStoreChange: () => void) {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getCoarsePointerSnapshot() {
  return window.matchMedia("(pointer: coarse)").matches;
}

/** SSR prefers mobile so phones don't hydrate into the 20MB desktop sources. */
function getCoarsePointerServerSnapshot() {
  return true;
}

export function useCoarsePointer() {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    getCoarsePointerSnapshot,
    getCoarsePointerServerSnapshot,
  );
}

export function useLandingMotion() {
  const reduceMotion = useReducedMotion() ?? false;
  const coarsePointer = useCoarsePointer();
  const lite = reduceMotion || coarsePointer;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return {
    reduceMotion,
    coarsePointer,
    /** Touch devices or prefers-reduced-motion — skip heavy continuous effects. */
    lite,
    mounted,
    spring: lite ? landingTween : landingSpring,
    springBouncy: lite ? landingTween : landingSpringBouncy,
    enterTransition: lite ? landingTween : landingSpring,
  };
}

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

export const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1 },
};

export const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
};

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  variant?: "fadeUp" | "fadeIn" | "scaleIn";
};

export function Reveal({ children, className, delay = 0, variant = "fadeUp" }: RevealProps) {
  const { lite, mounted, enterTransition } = useLandingMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "0px" });
  const variants =
    variant === "fadeIn" ? fadeInVariants : variant === "scaleIn" ? scaleInVariants : fadeUpVariants;

  if (lite) {
    return <div className={className}>{children}</div>;
  }

  // SSR + first paint stay visible. After mount, below-fold content can enter from hidden.
  const state = !mounted || isInView ? "visible" : "hidden";

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="visible"
      animate={state}
      variants={variants}
      transition={{ ...enterTransition, delay }}
    >
      {children}
    </motion.div>
  );
}

type StaggerProps = {
  children: React.ReactNode;
  className?: string;
};

export function Stagger({ children, className }: StaggerProps) {
  const { lite, mounted, enterTransition } = useLandingMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "0px" });

  if (lite) {
    return <div className={className}>{children}</div>;
  }

  const state = !mounted || isInView ? "visible" : "hidden";

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="visible"
      animate={state}
      variants={staggerContainerVariants}
      transition={enterTransition}
    >
      {children}
    </motion.div>
  );
}

type StaggerItemProps = {
  children: React.ReactNode;
  className?: string;
};

export function StaggerItem({ children, className }: StaggerItemProps) {
  const { lite, springBouncy } = useLandingMotion();

  if (lite) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={fadeUpVariants}
      transition={springBouncy}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );
}

type FloatOrbProps = {
  className?: string;
  duration?: number;
  delay?: number;
};

export function FloatOrb({ className, duration = 8, delay = 0 }: FloatOrbProps) {
  const { lite, mounted } = useLandingMotion();
  const staticOrb = (
    <div aria-hidden className={cn("pointer-events-none absolute rounded-full blur-3xl", className)} />
  );

  // Wait for mount so SSR never schedules infinite work; lite stays static.
  if (!mounted || lite) {
    return staticOrb;
  }

  return (
    <motion.div
      aria-hidden
      className={cn("pointer-events-none absolute rounded-full blur-3xl", className)}
      animate={{
        y: [0, -18, 8, 0],
        x: [0, 12, -8, 0],
        scale: [1, 1.08, 0.96, 1],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}
