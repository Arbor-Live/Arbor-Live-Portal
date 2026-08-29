"use client";

import Link from "next/link";
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
 * First slide for the public Open Mic wizard. Explains who Arbor Live is and
 * links to socials. Shown when the marketing "Open Mic marketing boost" toggle
 * is on. Styled to match the shared request wizard glass panels.
 */
export function OpenMicIntroSlide({ onContinue }: { onContinue: () => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <motion.p
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/65"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, ...spring }}
        >
          {landingHero.eyebrow}
        </motion.p>
        <motion.h1
          className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, ...spring }}
        >
          Welcome to Open Mic
        </motion.h1>
        <motion.p
          className="text-sm leading-relaxed text-foreground/70 sm:text-base"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, ...spring }}
        >
          {landingHero.subheadline} Open Mic is one of our weekly programs — a
          low-stakes, come-as-you-are stage for Stanford musicians, comedians,
          and anyone with something to share. Sign up below and we&apos;ll add you to
          the first-come, first-served queue.
        </motion.p>
      </div>

      <motion.div
        className="flex flex-wrap gap-3"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, ...spring }}
      >
        <Button type="button" size="lg" className="h-11 px-6" onClick={onContinue}>
          Sign up to perform
          <ArrowRightIcon className="ml-2" />
        </Button>
        <Button asChild variant="outline" size="lg" className="h-11 px-6">
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
        className="text-xs text-foreground/55"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, ...spring }}
      >
        Questions? Email{" "}
        <a
          href={`mailto:${ARBOR_CONTACT_EMAIL}`}
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          {ARBOR_CONTACT_EMAIL}
        </a>{" "}
        or visit{" "}
        <a
          href={`${ARBOR_EXTERNAL_SITE}/socials`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          {ARBOR_EXTERNAL_SITE.replace(/^https?:\/\//, "")}/socials
        </a>
        .
      </motion.p>
    </div>
  );
}
