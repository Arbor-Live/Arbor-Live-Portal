"use client";

import { motion } from "framer-motion";
import { ArrowSquareOutIcon, CheckIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** Persistent exit control shown on every onboarding wizard step. */
export function OnboardingSkipButton({
  onSkip,
  label = "Skip for now",
}: {
  onSkip: () => void;
  label?: string;
}) {
  return (
    <div className="fixed top-4 right-4 z-30 sm:top-5 sm:right-5">
      <button
        type="button"
        onClick={onSkip}
        className="flex items-center gap-1.5 border border-border/50 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground/70 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md transition-colors hover:bg-muted hover:text-foreground"
      >
        {label}
        <XIcon className="size-3.5" weight="bold" />
      </button>
    </div>
  );
}

/** External resource link styled like a small action card. */
export function OnboardingLinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start justify-between gap-3 border border-border/50 bg-background/50 p-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span>
        <span className="block font-medium text-foreground">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
      <ArrowSquareOutIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

/** Toggleable acknowledgement row used throughout onboarding steps. */
export function OnboardingAckCheckbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.99 }}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={cn(
        "flex w-full items-start gap-3 border p-3 text-left text-sm transition-colors",
        checked ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40",
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {checked ? <CheckIcon className="size-3" weight="bold" /> : null}
      </span>
      <span className="text-foreground/85">{label}</span>
    </motion.button>
  );
}

/** Two-way choice control, e.g. "Yes / No" prompts. */
export function OnboardingYesNoChoice({
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
}: {
  value: boolean | null;
  onChange: (next: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {[
        { label: yesLabel, val: true },
        { label: noLabel, val: false },
      ].map((option) => {
        const selected = value === option.val;
        return (
          <motion.button
            key={option.label}
            type="button"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onChange(option.val)}
            className={cn(
              "flex w-full items-center gap-3 border p-3 text-left text-sm transition-colors",
              selected ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40",
            )}
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
              )}
            >
              {selected ? <CheckIcon className="size-3" weight="bold" /> : null}
            </span>
            <span>{option.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

export function OnboardingFieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-foreground">{children}</p>;
}

export function OnboardingTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        props.className,
      )}
    />
  );
}
