"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { landingHero } from "@/lib/landing-content";
import {
  landingSpring,
  landingSpringBouncy,
  useLandingMotion,
} from "./landing-motion";

const LogoFlareMark = dynamic(
  () =>
    import("@/components/landing/logo-flare/logo-flare-mark").then(
      (mod) => mod.LogoFlareMark,
    ),
  {
    ssr: false,
    loading: () => (
      <Image
        src="/icon.svg"
        alt=""
        width={307}
        height={408}
        className="h-24 w-auto aspect-[307/408] sm:h-28 md:h-32 lg:h-36"
        priority
      />
    ),
  },
);

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
  const { reduceMotion } = useLandingMotion();
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void video.play().catch(() => {
            // Autoplay can be blocked by the browser; muted playback usually still works.
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-zinc-950 text-zinc-50">
      {!prefersReducedMotion ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="size-full object-cover opacity-60"
          >
            <source src="/hero-video" type="video/mp4" />
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

      <div className="relative z-[2] px-4 sm:px-5">
        <motion.div
          className="mx-auto flex min-h-[min(92vh,56rem)] max-w-6xl flex-col justify-center px-5 py-28 sm:px-6 sm:py-32"
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          variants={heroStagger}
        >
          <div className="flex flex-col items-center gap-8 text-center">
            <motion.div
              className="shrink-0"
              variants={heroItem}
              transition={landingSpring}
            >
              {prefersReducedMotion ? (
                <Image
                  src="/icon.svg"
                  alt=""
                  width={307}
                  height={408}
                  className="h-24 w-auto aspect-[307/408] sm:h-28 md:h-32 lg:h-36"
                  priority
                />
              ) : (
                <LogoFlareMark />
              )}
            </motion.div>

            <div className="min-w-0 max-w-2xl">
              <motion.h1
                className="display-tight text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl lg:text-5xl"
                variants={heroItem}
                transition={landingSpring}
              >
                {landingHero.headline}{" "}
                <span className="text-primary-foreground">{landingHero.accentWord}</span>{" "}
                {landingHero.headlineEnd}
              </motion.h1>

              <motion.p
                className="mx-auto mt-5 text-base leading-relaxed text-zinc-300 sm:text-lg"
                variants={heroItem}
                transition={landingSpring}
              >
                {landingHero.subheadline}
              </motion.p>

              <motion.div
                className="mt-8 flex flex-wrap justify-center gap-3"
                variants={heroItem}
                transition={landingSpringBouncy}
              >
                <motion.div
                  whileHover={reduceMotion ? undefined : { scale: 1.03 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                >
                  <Button asChild size="lg" className="h-11 px-6">
                    <Link href={landingHero.primaryCta.href}>
                      {landingHero.primaryCta.label}
                    </Link>
                  </Button>
                </motion.div>
                <motion.div
                  whileHover={reduceMotion ? undefined : { scale: 1.03 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                >
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-11 border-zinc-700 bg-transparent px-6 text-zinc-100 hover:bg-zinc-900 hover:text-white"
                  >
                    <Link href={landingHero.secondaryCta.href}>
                      {landingHero.secondaryCta.label}
                    </Link>
                  </Button>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>

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
