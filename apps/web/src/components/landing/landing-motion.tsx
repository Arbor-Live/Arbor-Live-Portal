"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

export const landingSpring = { type: "spring" as const, stiffness: 380, damping: 36 };
export const landingSpringBouncy = { type: "spring" as const, stiffness: 420, damping: 22 };

export function useLandingMotion() {
  const reduceMotion = useReducedMotion();
  return {
    reduceMotion: reduceMotion ?? false,
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

type FloatOrbProps = {
  className?: string;
  duration?: number;
  delay?: number;
};

export function FloatOrb({ className, duration = 8, delay = 0 }: FloatOrbProps) {
  const { reduceMotion } = useLandingMotion();

  if (reduceMotion) {
    return <div aria-hidden className={cn("pointer-events-none absolute rounded-full blur-3xl", className)} />;
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
