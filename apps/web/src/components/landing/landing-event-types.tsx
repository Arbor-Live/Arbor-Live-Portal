"use client";

import { motion, useReducedMotion } from "framer-motion";
import { landingEventTypes } from "@/lib/landing-content";
import { Reveal, Stagger, StaggerItem } from "./landing-motion";

export function LandingEventTypes() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="events" className="border-b bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 className="display-tight text-3xl font-semibold tracking-tight sm:text-4xl">
            What we can run
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            From intimate open mics to full-scale festivals — Arbor Live handles technical production,
            logistics, and show operations across campus.
          </p>
        </Reveal>

        <Stagger className="mt-10 flex flex-wrap gap-2">
          {landingEventTypes.map((eventType, index) => (
            <StaggerItem key={eventType}>
              <motion.span
                className="inline-block rounded-none border bg-card px-3 py-2 text-sm font-medium text-foreground ring-1 ring-foreground/10"
                whileHover={
                  reduceMotion
                    ? undefined
                    : {
                        scale: 1.06,
                        rotate: index % 2 === 0 ? -2 : 2,
                        transition: { type: "spring", stiffness: 500, damping: 18 },
                      }
                }
              >
                {eventType}
              </motion.span>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
