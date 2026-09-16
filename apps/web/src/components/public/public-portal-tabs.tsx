"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type PublicPortalTab = {
  id: string;
  label: string;
  /** Pulse a dot on the tab while it still needs the client's attention. */
  attention?: boolean;
};

/**
 * Client-facing portal tab bar + animated content region. Tabs are supplied by
 * the caller so sections can appear as they become relevant to the client's
 * stage in the process. The underline slides between tabs and content
 * cross-fades; both respect prefers-reduced-motion.
 */
export function PublicPortalTabs({
  tabs,
  activeTab,
  onSelect,
  children,
}: {
  tabs: PublicPortalTab[];
  activeTab: string;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <>
      <div className="border-b border-border/60">
        <div
          role="tablist"
          aria-label="Event portal sections"
          className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 sm:gap-7 sm:px-6 lg:px-8"
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(tab.id)}
                className={cn(
                  "relative shrink-0 px-0.5 pt-4 pb-3 text-sm font-medium transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  {tab.label}
                  {tab.attention && !active ? (
                    <span aria-hidden className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                    </span>
                  ) : null}
                </span>
                {active ? (
                  <motion.span
                    aria-hidden
                    layoutId="public-portal-tab-underline"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 460, damping: 40 }
                    }
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
