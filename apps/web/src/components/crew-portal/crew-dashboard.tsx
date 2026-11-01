"use client";

import { useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { CustomizableWidgetDashboard } from "@/components/dashboard/customizable-widget-dashboard";
import { CrewTodoStack } from "@/components/crew-portal/crew-todo-stack";
import { OnShiftCard, useActiveShifts } from "@/components/crew-portal/on-shift-card";
import { getWidgetsForDisciplines } from "@/components/crew-portal/widget-registry";
import { CohoGiftCardWidget } from "@/components/crew-portal/widgets/coho-gift-card-widget";
import { ScheduledEventsWidget } from "@/components/crew-portal/widgets/scheduled-events-widget";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SECTION_LABEL = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

export function CrewDashboard() {
  const viewer = useSessionViewer();
  // Shared so the stack and both Upcoming shifts mounts are one subscription.
  const [now] = useState(() => Date.now());
  const [moreOpen, setMoreOpen] = useState(false);
  const shifts = useActiveShifts();
  // Undefined until known, so the stack doesn't flash open before folding away.
  const shiftActive = shifts?.some((shift) => shift.phase !== "ended");

  if (!viewer) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="hidden h-80 w-full lg:block" />
      </div>
    );
  }

  return (
    <CustomizableWidgetDashboard
      dashboardKey="crewHome"
      title="Home"
      widgets={getWidgetsForDisciplines(viewer.disciplines)}
      omitWidgetIds={shiftActive ? ["coho-gift-card"] : undefined}
      layout={({ header, customize, reset, body }) => (
        <>
          <h1 className="sr-only lg:hidden">Home</h1>
          <div className="hidden lg:block">{header}</div>
          <OnShiftCard />

          <div
            className={cn(
              "grid items-start gap-4",
              shiftActive ? "lg:grid-cols-3" : "lg:grid-cols-[minmax(0,1fr)_22rem]",
            )}
          >
            <div className="min-w-0">
              <CrewTodoStack now={now} collapsed={shiftActive} />
            </div>
            {shiftActive ? (
              <div className="min-w-0 empty:hidden">
                <CohoGiftCardWidget />
              </div>
            ) : null}
            <div className="hidden min-w-0 lg:block">
              <ScheduledEventsWidget now={now} />
            </div>
          </div>

          <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="space-y-3">
            <CollapsibleTrigger className="flex h-11 w-full items-center justify-between border-y lg:hidden">
              <span className={SECTION_LABEL}>Everything else</span>
              <CaretDownIcon
                className={cn("size-4 text-muted-foreground transition-transform", moreOpen && "rotate-180")}
                aria-hidden
              />
            </CollapsibleTrigger>
            <h2 className={cn(SECTION_LABEL, "hidden lg:block")}>Everything else</h2>
            {/* Mounted while closed: the same content is always open at lg, and CSS decides. */}
            <CollapsibleContent forceMount className="space-y-4 data-[state=closed]:hidden lg:data-[state=closed]:block">
              <div className="flex items-center justify-end gap-2 lg:hidden">
                {reset}
                {customize}
              </div>
              <div className="min-w-0 lg:hidden">
                <ScheduledEventsWidget now={now} />
              </div>
              {body}
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    />
  );
}
