"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

type BookingRequestNavProps = {
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

export function BookingRequestNav({
  showBack,
  showNext,
  nextLabel,
  isSubmitting,
  skippable,
  className,
  onBack,
  onNext,
  onSkip,
}: BookingRequestNavProps) {
  return (
    <div className={className ?? "space-y-3 pt-6"}>
      <div className="flex min-h-7 items-center justify-center">
        {skippable ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={onSkip}
            disabled={isSubmitting}
          >
            Skip
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          {showBack ? (
            <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
              Back
            </Button>
          ) : (
            <span />
          )}
        </div>
        <div className="flex items-center gap-3">
          {showNext ? (
            <>
              <p className="hidden text-xs text-muted-foreground sm:block">Press Enter ↵</p>
              <motion.div whileTap={{ scale: 0.98 }}>
                <Button type="button" onClick={onNext} disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : nextLabel}
                </Button>
              </motion.div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
