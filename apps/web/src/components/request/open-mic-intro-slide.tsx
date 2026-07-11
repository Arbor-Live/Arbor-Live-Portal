"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRightIcon, InstagramLogoIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  ARBOR_CONTACT_EMAIL,
  ARBOR_EXTERNAL_SITE,
  landingHero,
} from "@/lib/landing-content";

const spring = { type: "spring" as const, stiffness: 380, damping: 36 };

/**
 * Full-bleed first slide for the public Open Mic wizard. Plays the Arbor Live
 * promo video in the background, explains who Arbor Live is, and links to
 * socials. Shown only when the marketing "Open Mic marketing boost" toggle is
 * on. Mirrors the landing hero video pattern (`landing-hero.tsx`).
 */
export function OpenMicIntroSlide({ onContinue }: { onContinue: () => void }) {
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
    <div className="relative overflow-hidden rounded-lg bg-zinc-950 text-zinc-50">
      {!reduceMotion ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="size-full object-cover opacity-50"
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
        className="pointer-events-none absolute inset-0 z-[1] bg-zinc-950/45"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_35%,transparent),transparent)]"
      />

      <div className="relative z-[2] mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 sm:py-24">
        <motion.p
          className="text-xs font-medium uppercase tracking-[0.14em] text-primary-foreground/80"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, ...spring }}
        >
          {landingHero.eyebrow}
        </motion.p>
        <motion.h1
          className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, ...spring }}
        >
          Welcome to Open Mic
        </motion.h1>
        <motion.p
          className="max-w-xl text-base leading-relaxed text-zinc-200"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, ...spring }}
        >
          {landingHero.subheadline} Open Mic is one of our weekly programs — a
          low-stakes, come-as-you-are stage for Stanford musicians, comedians,
          and anyone with something to share. Sign up below and we&apos;ll add you to
          the first-come, first-served queue.
        </motion.p>

        <motion.div
          className="flex flex-wrap gap-3"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, ...spring }}
        >
          <Button
            type="button"
            size="lg"
            className="h-11 px-6"
            onClick={onContinue}
          >
            Sign up to perform
            <ArrowRightIcon className="ml-2" />
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-11 border-zinc-700 bg-transparent px-6 text-zinc-100 hover:bg-zinc-900 hover:text-white"
          >
            <Link
              href="https://instagram.com/thearborstanford"
              target="_blank"
              rel="noopener noreferrer"
            >
              <InstagramLogoIcon className="mr-2" />
              Follow us
            </Link>
          </Button>
        </motion.div>

        <motion.p
          className="text-xs text-zinc-400"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, ...spring }}
        >
          Questions? Email{" "}
          <a
            href={`mailto:${ARBOR_CONTACT_EMAIL}`}
            className="underline-offset-2 hover:text-white hover:underline"
          >
            {ARBOR_CONTACT_EMAIL}
          </a>{" "}
          or visit{" "}
          <a
            href={`${ARBOR_EXTERNAL_SITE}/socials`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:text-white hover:underline"
          >
            {ARBOR_EXTERNAL_SITE.replace(/^https?:\/\//, "")}/socials
          </a>
          .
        </motion.p>
      </div>
    </div>
  );
}