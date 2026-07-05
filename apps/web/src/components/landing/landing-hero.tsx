"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { landingHero } from "@/lib/landing-content";
import { FloatOrb, landingSpring, landingSpringBouncy } from "./landing-motion";

const heroStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

const heroItem = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};

export function LandingHero() {
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (reduceMotion) return;
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => {
      // Autoplay can be blocked by the browser; muted playback usually still works.
    });
  }, [reduceMotion]);

  return (
    <section className="relative overflow-hidden bg-zinc-950 text-zinc-50">
      {!reduceMotion ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="size-full object-cover opacity-60"
          >
            <source
              src={landingHero.backgroundVideoSrcHevc}
              type='video/mp4; codecs="hvc1"'
            />
            <source src={landingHero.backgroundVideoSrc} type="video/mp4" />
          </video>
        </div>
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] bg-zinc-950/35"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_35%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] opacity-30 [background-image:linear-gradient(to_right,color-mix(in_oklch,white_6%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,white_6%,transparent)_1px,transparent_1px)] [background-size:4rem_4rem]"
      />

      <FloatOrb
        className="z-[1] left-[8%] top-[18%] size-48 bg-primary/25"
        duration={9}
      />
      <FloatOrb
        className="z-[1] right-[12%] top-[28%] size-36 bg-emerald-400/15"
        duration={11}
        delay={1.2}
      />
      <FloatOrb
        className="z-[1] bottom-[12%] left-[42%] size-56 bg-primary/15"
        duration={13}
        delay={0.6}
      />

      <motion.div
        className="relative z-[2] mx-auto flex min-h-[min(88vh,52rem)] max-w-6xl flex-col justify-center px-4 py-24 sm:px-6 lg:px-8"
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
        variants={heroStagger}
      >
        <motion.div className="mb-8" variants={heroItem} transition={landingSpring}>
          <Image
            src="/logo.svg"
            alt="Arbor Live"
            width={200}
            height={56}
            className="h-10 w-auto sm:h-12"
            priority
          />
        </motion.div>

        <motion.p
          className="text-sm font-medium tracking-wide text-primary-foreground/80 uppercase"
          variants={heroItem}
          transition={landingSpring}
        >
          {landingHero.eyebrow}
        </motion.p>

        <motion.h1
          className="display-tight mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
          variants={heroItem}
          transition={landingSpring}
        >
          {landingHero.headline}{" "}
          <motion.span
            className="hero-slot-word inline-block text-primary-foreground"
            animate={
              reduceMotion
                ? undefined
                : {
                    rotate: [0, -1.5, 1.5, 0],
                    y: [0, -3, 0],
                  }
            }
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {landingHero.accentWord}
          </motion.span>{" "}
          {landingHero.headlineEnd}
        </motion.h1>

        <motion.p
          className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg"
          variants={heroItem}
          transition={landingSpring}
        >
          {landingHero.subheadline}
        </motion.p>

        <motion.div
          className="mt-10 flex flex-wrap gap-3"
          variants={heroItem}
          transition={landingSpringBouncy}
        >
          <motion.div whileHover={reduceMotion ? undefined : { scale: 1.03 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
            <Button asChild size="lg" className="h-11 px-6">
              <Link href={landingHero.primaryCta.href}>{landingHero.primaryCta.label}</Link>
            </Button>
          </motion.div>
          <motion.div whileHover={reduceMotion ? undefined : { scale: 1.03 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 border-zinc-700 bg-transparent px-6 text-zinc-100 hover:bg-zinc-900 hover:text-white"
            >
              <Link href={landingHero.secondaryCta.href}>{landingHero.secondaryCta.label}</Link>
            </Button>
          </motion.div>
        </motion.div>
      </motion.div>

      <p className="absolute right-4 bottom-4 z-[2] text-[10px] tracking-wide text-zinc-400/80 sm:right-6 sm:bottom-6 sm:text-xs">
        Video by{" "}
        <a
          href={landingHero.backgroundVideoCredit.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-300/90 underline-offset-2 hover:text-white hover:underline"
        >
          {landingHero.backgroundVideoCredit.label}
        </a>
      </p>
    </section>
  );
}
