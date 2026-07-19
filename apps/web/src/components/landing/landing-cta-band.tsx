"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Reveal, useLandingMotion } from "./landing-motion";

export function LandingCtaBand() {
  const { lite, springBouncy } = useLandingMotion();

  return (
    <section className="relative overflow-hidden bg-primary py-14 text-primary-foreground sm:py-16">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 h-32 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,white_12%,transparent),transparent)]"
        animate={lite ? undefined : { opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Reveal className="max-w-xl">
          <h2 className="display-tight text-2xl font-semibold tracking-tight sm:text-3xl">
            Ready to bring your event to life?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-primary-foreground/90 sm:text-base">
            Tell us about your event and our team will follow up with next steps.
          </p>
        </Reveal>
        <motion.div
          whileHover={lite ? undefined : { scale: 1.05, rotate: -1 }}
          whileTap={lite ? undefined : { scale: 0.97 }}
          transition={springBouncy}
        >
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="h-11 shrink-0 bg-primary-foreground text-primary hover:bg-primary-foreground/90"
          >
            <Link href="/public/request">Start a booking request</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
