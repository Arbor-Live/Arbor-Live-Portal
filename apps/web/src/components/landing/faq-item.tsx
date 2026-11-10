"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LandingFaq } from "@/lib/landing-content";

const CLOWN_COUNT = 24;
const RAIN_MS = 2600;

type Clown = { id: number; left: number; delay: number; duration: number; spin: number; size: number };

function makeClowns(): Clown[] {
  return Array.from({ length: CLOWN_COUNT }, (_, id) => ({
    id,
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 1.4 + Math.random() * 0.9,
    spin: (Math.random() - 0.5) * 540,
    size: 28 + Math.random() * 28,
  }));
}

/** One-shot shower of crossed-out clowns. */
function ClownRain({ onDone }: { onDone: () => void }) {
  const [clowns] = useState(makeClowns);

  useEffect(() => {
    const timer = window.setTimeout(onDone, RAIN_MS + 600);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-80 overflow-hidden">
      {clowns.map((clown) => (
        <motion.span
          key={clown.id}
          className="absolute top-0 select-none"
          style={{ left: `${clown.left}%`, fontSize: clown.size }}
          initial={{ y: "-15vh", rotate: 0, opacity: 1 }}
          animate={{ y: "115vh", rotate: clown.spin, opacity: [1, 1, 0.9] }}
          transition={{ duration: clown.duration, delay: clown.delay, ease: [0.4, 0, 0.9, 0.6] }}
        >
          <span className="relative inline-block leading-none">
            🤡
            <span className="absolute inset-0 flex items-center justify-center leading-none">
              🚫
            </span>
          </span>
        </motion.span>
      ))}
    </div>,
    document.body,
  );
}

function EasterEggTrigger({
  text,
  onTrigger,
}: {
  text: string;
  onTrigger: () => void;
}) {
  // Inline inherit: the button must be indistinguishable from the sentence around it.
  return (
    <button
      type="button"
      onClick={onTrigger}
      style={{ font: "inherit", color: "inherit", letterSpacing: "inherit" }}
      className="inline cursor-pointer appearance-none border-0 bg-transparent p-0 focus-visible:underline focus-visible:outline-none"
    >
      {text}
    </button>
  );
}

function FaqAnswer({ faq }: { faq: LandingFaq }) {
  const reduceMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const [raining, setRaining] = useState(false);
  const paragraphs = faq.answer.split(/\n{2,}/);
  const egg = faq.easterEgg;

  const stopRain = useCallback(() => setRaining(false), []);

  function trigger() {
    setRevealed(true);
    if (!reduceMotion) setRaining(true);
  }

  return (
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
      {paragraphs.map((paragraph, index) => {
        const at = egg ? paragraph.indexOf(egg.trigger) : -1;
        if (!egg || at === -1) return <p key={index}>{paragraph}</p>;
        return (
          <p key={index}>
            {paragraph.slice(0, at)}
            <EasterEggTrigger text={egg.trigger} onTrigger={trigger} />
            {paragraph.slice(at + egg.trigger.length)}
          </p>
        );
      })}

      <AnimatePresence>
        {egg && revealed ? (
          <motion.p
            key="egg"
            role="status"
            className="font-semibold text-foreground"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.6, rotate: -4 }}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, rotate: 0, x: [0, -6, 6, -4, 4, 0] }
            }
            transition={
              reduceMotion
                ? { duration: 0.2 }
                : {
                    opacity: { duration: 0.15, delay: 0.5 },
                    scale: { type: "spring", stiffness: 500, damping: 18, delay: 0.5 },
                    rotate: { type: "spring", stiffness: 500, damping: 18, delay: 0.5 },
                    x: { duration: 0.4, delay: 0.75 },
                  }
            }
          >
            {egg.reveal}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {raining ? <ClownRain onDone={stopRain} /> : null}
    </div>
  );
}

export function FaqItem({ faq }: { faq: LandingFaq }) {
  return (
    <details className="group py-4">
      <summary className="cursor-pointer list-none text-base font-medium marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-4">
          {faq.question}
          <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
            +
          </span>
        </span>
      </summary>
      <FaqAnswer faq={faq} />
    </details>
  );
}
