"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

type BookingRequestNavProps = {
  showBack: boolean;
  showNext: boolean;
  nextLabel: string;
  isSubmitting?: boolean;
  onBack: () => void;
  onNext: () => void;
};

export function BookingRequestNav({
  showBack,
  showNext,
  nextLabel,
  isSubmitting,
  onBack,
  onNext,
}: BookingRequestNavProps) {
  return (
    <div className="flex items-center justify-between gap-3 pt-6">
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
  );
}
