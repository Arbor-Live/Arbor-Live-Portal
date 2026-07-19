"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { landingHero } from "@/lib/landing-content";
import { FloatOrb, useLandingMotion } from "./landing-motion";

const heroStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

/** Y-only entrance so hero copy stays readable if JS is delayed. */
const heroItem = {
  hidden: { opacity: 1, y: 24 },
  visible: { opacity: 1, y: 0 },
};

function useHeroVideoAutoplay(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  /** Remount / source swap token — re-run play attempts when the file changes. */
  sourceKey: string,
) {
  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;

    // iOS Safari is strict: muted + playsInline must be set before play().
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");

    const tryPlay = () => {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        void playPromise.catch(() => {
          // Autoplay can still be blocked (Low Power Mode, etc.).
        });
      }
    };

    tryPlay();
    video.addEventListener("loadeddata", tryPlay);
    video.addEventListener("canplay", tryPlay);
    video.addEventListener("canplaythrough", tryPlay);

    return () => {
      video.removeEventListener("loadeddata", tryPlay);
      video.removeEventListener("canplay", tryPlay);
      video.removeEventListener("canplaythrough", tryPlay);
    };
  }, [enabled, sourceKey, videoRef]);
}

export function LandingHero() {
  const { lite, reduceMotion, coarsePointer, spring, springBouncy } = useLandingMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Keep video in the tree as soon as we know motion is allowed — don't wait on
  // a separate mounted gate (that delayed first paint / autoplay on phones).
  const showVideo = !reduceMotion;
  const useMobileVideo = coarsePointer;
  const sourceKey = useMobileVideo ? "mobile" : "desktop";

  useHeroVideoAutoplay(videoRef, showVideo, sourceKey);

  return (
    <section className="relative overflow-hidden bg-zinc-950 text-zinc-50">
      {showVideo ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <video
            ref={videoRef}
            key={sourceKey}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            className="size-full object-cover opacity-60"
          >
            {useMobileVideo ? (
              <source src={landingHero.backgroundVideoSrcMobile} type="video/mp4" />
            ) : (
              <>
                <source
                  src={landingHero.backgroundVideoSrcHevc}
                  type='video/mp4; codecs="hvc1"'
                />
                <source src={landingHero.backgroundVideoSrc} type="video/mp4" />
              </>
            )}
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

      <div className="relative z-[2] px-4 sm:px-5">
        <motion.div
          className="mx-auto flex min-h-[min(92vh,56rem)] max-w-6xl flex-col justify-center px-5 py-28 sm:px-6 sm:py-32"
          initial={lite ? false : "hidden"}
          animate="visible"
          variants={heroStagger}
        >
          <div className="flex flex-col items-center gap-8 text-center">
            <motion.div
              className="shrink-0"
              variants={heroItem}
              transition={spring}
            >
              <Image
                src="/icon.svg"
                alt=""
                width={307}
                height={408}
                className="h-24 w-auto sm:h-28 md:h-32 lg:h-36"
                priority
              />
            </motion.div>

            <div className="min-w-0 max-w-2xl">
              <motion.h1
                className="display-tight text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl lg:text-5xl"
                variants={heroItem}
                transition={spring}
              >
                {landingHero.headline}{" "}
                <span className="text-primary-foreground">{landingHero.accentWord}</span>{" "}
                {landingHero.headlineEnd}
              </motion.h1>

              <motion.p
                className="mx-auto mt-5 text-base leading-relaxed text-zinc-300 sm:text-lg"
                variants={heroItem}
                transition={spring}
              >
                {landingHero.subheadline}
              </motion.p>

              <motion.div
                className="mt-8 flex flex-wrap justify-center gap-3"
                variants={heroItem}
                transition={springBouncy}
              >
                <motion.div
                  whileHover={lite ? undefined : { scale: 1.03 }}
                  whileTap={lite ? undefined : { scale: 0.98 }}
                >
                  <Button asChild size="lg" className="h-11 px-6">
                    <Link href={landingHero.primaryCta.href}>
                      {landingHero.primaryCta.label}
                    </Link>
                  </Button>
                </motion.div>
                <motion.div
                  whileHover={lite ? undefined : { scale: 1.03 }}
                  whileTap={lite ? undefined : { scale: 0.98 }}
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

      {showVideo ? (
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
      ) : null}
    </section>
  );
}
