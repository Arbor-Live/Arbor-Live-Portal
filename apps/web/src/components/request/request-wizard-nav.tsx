"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

type RequestWizardNavProps = {
  showBack: boolean;
  showNext: boolean;
  nextLabel: string;
  isSubmitting?: boolean;
  skippable?: boolean;
  className?: string;
  onBack: () => void;
  onNext: () => void;
  onSkip?: () => void;
};

/** Shared Back / Skip / Next controls for public request wizards. */
export function RequestWizardNav({
  showBack,
  showNext,
  nextLabel,
  isSubmitting,
  skippable,
  className,
  onBack,
  onNext,
  onSkip,
}: RequestWizardNavProps) {
  return (
    <div className={className ?? "pt-2"}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="justify-self-start">
          {showBack ? (
            <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
              Back
            </Button>
          ) : null}
        </div>

        <div className="justify-self-center">
          {skippable ? (
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={onSkip}
              disabled={isSubmitting}
            >
              Skip
            </button>
          ) : showNext ? (
            <p className="hidden text-xs text-muted-foreground sm:block">Press Enter ↵</p>
          ) : null}
        </div>

        <div className="justify-self-end">
          {showNext ? (
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button type="button" onClick={onNext} disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : nextLabel}
              </Button>
            </motion.div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
