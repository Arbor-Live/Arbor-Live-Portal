"use client";

import { useSyncExternalStore } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

export const landingSpring = { type: "spring" as const, stiffness: 380, damping: 36 };
export const landingSpringBouncy = { type: "spring" as const, stiffness: 420, damping: 22 };

const mobileMotionQuery = "(max-width: 767px), (pointer: coarse)";

function subscribeToMobileMotion(callback: () => void) {
  const mediaQuery = window.matchMedia(mobileMotionQuery);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function isMobileMotionDevice() {
  return window.matchMedia(mobileMotionQuery).matches;
}

export function useLandingMotion() {
  const reduceMotion = useReducedMotion();
  const mobileMotionDevice = useSyncExternalStore(
    subscribeToMobileMotion,
    isMobileMotionDevice,
    () => true,
  );

  return {
    reduceMotion: (reduceMotion ?? false) || mobileMotionDevice,
    spring: landingSpring,
    springBouncy: landingSpringBouncy,
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
  const { reduceMotion } = useLandingMotion();
  const variants =
    variant === "fadeIn" ? fadeInVariants : variant === "scaleIn" ? scaleInVariants : fadeUpVariants;

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-8% 0px" }}
      variants={variants}
      transition={{ ...landingSpring, delay }}
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
  const { reduceMotion } = useLandingMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-6% 0px" }}
      variants={staggerContainerVariants}
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
  const { reduceMotion, springBouncy } = useLandingMotion();

  if (reduceMotion) {
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
