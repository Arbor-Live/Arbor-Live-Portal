"use client";

import { motion, useReducedMotion } from "framer-motion";
import { landingStats } from "@/lib/landing-content";
import { Stagger, StaggerItem, landingSpringBouncy } from "./landing-motion";

export function LandingStats() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="border-b bg-muted/40 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Stagger className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {landingStats.map((stat) => (
            <StaggerItem key={stat.label}>
              <motion.div
                className="text-center sm:text-left"
                whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                transition={landingSpringBouncy}
              >
                <p className="display-tight text-4xl font-semibold tracking-tight text-primary sm:text-5xl">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">{stat.label}</p>
              </motion.div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
