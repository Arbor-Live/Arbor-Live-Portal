"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type BrandCopyButtonProps = {
  value: string;
  /** Visible text; defaults to `value`. */
  children?: React.ReactNode;
  className?: string;
};

/** A phrase or hex code a partner can copy straight into their design. */
export function BrandCopyButton({ value, children, className }: BrandCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      notify.error("Could not copy. Select the text and copy it instead.");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy “${value}”`}
      className={cn(
        "group inline-flex items-center gap-2 text-left transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <span>{children ?? value}</span>
      {copied ? (
        <CheckIcon aria-hidden className="size-4 shrink-0 text-primary" weight="bold" />
      ) : (
        <CopyIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
        />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
