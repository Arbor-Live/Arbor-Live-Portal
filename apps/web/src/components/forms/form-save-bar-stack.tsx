"use client";

import { createContext, useContext, useState } from "react";
import { useOptionalSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Container that collects every mounted `FormSaveBar` into one fixed column.
 *
 * Save bars used to each render their own `fixed bottom-0 z-40` element, so a
 * page with two of them (the event editor plus the Equipment tab's pull-list
 * form, say) stacked them on the exact same spot and the lower one swallowed
 * every click meant for the upper one. Portalling them into a single flex
 * column keeps all of them visible and clickable.
 *
 * The context is optional: outside a provider `FormSaveBar` falls back to its
 * original standalone fixed positioning.
 */
const FormSaveBarStackContext = createContext<HTMLDivElement | null>(null);

export function useFormSaveBarStack() {
  return useContext(FormSaveBarStackContext);
}

export function FormSaveBarStackProvider({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const sidebar = useOptionalSidebar();
  const usesSidebarInset = sidebar && !sidebar.isMobile && sidebar.open;

  return (
    <FormSaveBarStackContext.Provider value={container}>
      {children}
      <div
        ref={setContainer}
        // Empty container must not eat clicks on the page behind it; each bar
        // re-enables pointer events for itself.
        className={cn(
          "pointer-events-none fixed bottom-0 z-40 flex flex-col",
          usesSidebarInset
            ? "left-[var(--sidebar-width)] right-0 transition-[left] duration-200 ease-linear"
            : "inset-x-0",
        )}
      />
    </FormSaveBarStackContext.Provider>
  );
}
