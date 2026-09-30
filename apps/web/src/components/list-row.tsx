"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ListRowProps = Omit<ComponentPropsWithoutRef<"li">, "children"> & {
  children: ReactNode;
  /** Opens the row's side panel when its main area is clicked. */
  onOpen?: () => void;
  /** Renders the main area as a link instead of a button. */
  href?: string;
  /** Content before the clickable area: an order number, a checkbox, an avatar. */
  leading?: ReactNode;
  /** Right-aligned actions outside the clickable area: a ⋯ menu, a button. */
  actions?: ReactNode;
  /** Extra classes for the clickable area (padding, gap). */
  bodyClassName?: string;
};

const BODY_CLASS = "flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left";

/**
 * A dashboard list row. The whole row highlights on hover, the main area opens
 * the row, and `leading` / `actions` sit outside the clickable area. Keeps
 * every list (lineup, payouts, users, requests) behaving the same — see the
 * "rows plus a side panel" pattern in the dashboard-design skill.
 */
export function ListRow({
  children,
  onOpen,
  href,
  leading,
  actions,
  className,
  bodyClassName,
  ...liProps
}: ListRowProps) {
  const body = cn(BODY_CLASS, bodyClassName);
  return (
    <li
      className={cn(
        // A trailing ⋯ menu brings its own inset; without one, match the left edge.
        "flex items-center gap-2 border pl-3 text-sm transition-colors hover:bg-muted/30",
        actions ? "pr-1" : "pr-3",
        className,
      )}
      {...liProps}
    >
      {leading}
      {href ? (
        <Link href={href} className={body}>
          {children}
        </Link>
      ) : (
        <button type="button" className={body} onClick={onOpen}>
          {children}
        </button>
      )}
      {actions}
    </li>
  );
}
