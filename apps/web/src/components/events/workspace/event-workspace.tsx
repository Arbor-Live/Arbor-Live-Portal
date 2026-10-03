"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CalendarDotsIcon, RepeatIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { Id } from "@/lib/convex-api";
import { activeTabFromPathname, type EventEditorTabId } from "@/lib/event-editor-tabs";
import { eventGroupKind, groupScopeLabels, type SeriesEditScope } from "@/lib/event-series";
import { ApplyDaySetupDialog } from "@/components/events/apply-day-setup-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FormSaveBar } from "@/components/forms";
import { DRAFT_SECTION_LABELS } from "@/components/events/workspace/event-draft";
import {
  EventWorkspaceProvider,
  useEventWorkspace,
} from "@/components/events/workspace/event-workspace-provider";
import { EventWorkspaceHeader } from "@/components/events/workspace/event-workspace-header";
import { EventWorkspaceNav } from "@/components/events/workspace/event-workspace-nav";
import { OverviewTab } from "@/components/events/workspace/tabs/overview-tab";
import { ScheduleCrewTab } from "@/components/events/workspace/tabs/schedule-crew-tab";
import { EquipmentTab } from "@/components/events/workspace/tabs/equipment-tab";
import { LineupTab } from "@/components/events/workspace/tabs/lineup-tab";
import { BillingTab } from "@/components/events/workspace/tabs/billing-tab";
import { PromoTab } from "@/components/events/workspace/tabs/promo-tab";

const TAB_PANELS: Record<EventEditorTabId, () => React.ReactNode> = {
  overview: OverviewTab,
  schedule: ScheduleCrewTab,
  equipment: EquipmentTab,
  artists: LineupTab,
  billing: BillingTab,
  promo: PromoTab,
};

const DIRTY_LABELS = { ...DRAFT_SECTION_LABELS, schedule: "Schedule" } as const;

function SeriesEditScopeDialog() {
  const { editScopeRequest, seriesMeta } = useEventWorkspace();
  const kind = eventGroupKind(seriesMeta);
  const labels = groupScopeLabels(kind);
  const multiDay = kind === "multi_day";
  return (
    <Dialog
      open={editScopeRequest !== null}
      onOpenChange={(open) => {
        if (!open) editScopeRequest?.(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {multiDay ? (
              <CalendarDotsIcon className="size-4" aria-hidden />
            ) : (
              <RepeatIcon className="size-4" aria-hidden />
            )}
            {multiDay ? "Apply changes to other days?" : "Apply changes to series?"}
          </DialogTitle>
          <DialogDescription>
            {multiDay
              ? "This day is part of a multi-day booking. Other days take the shared details (venue, type, host, people); their own title, times and costs stay."
              : "This event is part of a recurring series. Crew scheduling is never updated in bulk."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {(["this", "future", "all"] as SeriesEditScope[]).map((scope) => (
            <Button key={scope} type="button" variant="outline" onClick={() => editScopeRequest?.(scope)}>
              {labels[scope]}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceApplySetupDialog() {
  const { applySetupOpen, setApplySetupOpen, applySetupToOtherDays, seriesMeta } =
    useEventWorkspace();
  // Ungrouped linked days (booked before groups) are grouped on first apply.
  const kind = seriesMeta ? eventGroupKind(seriesMeta) : "multi_day";
  return (
    <ApplyDaySetupDialog
      open={applySetupOpen}
      onOpenChange={setApplySetupOpen}
      kind={kind}
      onApply={applySetupToOtherDays}
    />
  );
}

function WorkspaceSaveBar() {
  const { dirty, saveStatus, saveError, saveAll, discardChanges, canEdit, clearSavedStatus } =
    useEventWorkspace();
  const isDirty = dirty.size > 0;

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const id = window.setTimeout(clearSavedStatus, 2500);
    return () => window.clearTimeout(id);
  }, [saveStatus, clearSavedStatus]);

  if (!canEdit) return null;
  // Editing again after a save means the page is unsaved, not "Saved".
  const displayStatus = saveStatus === "saved" && isDirty ? "idle" : saveStatus;
  return (
    <FormSaveBar
      tier="C"
      saveStatus={displayStatus}
      saveError={saveError}
      isDirty={isDirty}
      saveLabel="Save changes"
      onSave={() => void saveAll()}
      onRetry={() => void saveAll()}
      onDiscard={discardChanges}
      summary={
        isDirty && displayStatus === "idle" ? (
          <span className="text-xs text-muted-foreground">
            Unsaved: {[...dirty].map((section) => DIRTY_LABELS[section]).join(" · ")}
          </span>
        ) : null
      }
    />
  );
}

function WorkspaceBody() {
  const { eventData, readOnly, activeTab } = useEventWorkspace();

  if (eventData === undefined) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (eventData === null) {
    return (
      <Alert variant="destructive">
        <WarningCircleIcon className="size-4" />
        <AlertTitle>Event not found</AlertTitle>
        <AlertDescription>It may have been deleted.</AlertDescription>
      </Alert>
    );
  }

  const Panel = TAB_PANELS[activeTab];
  return (
    <div className="space-y-4 pb-24" data-testid="event-workspace">
      <EventWorkspaceHeader />
      {readOnly ? (
        <Alert>
          <WarningCircleIcon className="size-4" />
          <AlertTitle>Read-only view</AlertTitle>
          <AlertDescription>
            You can view this event but only crew leads and admins can make changes.
          </AlertDescription>
        </Alert>
      ) : null}
      <EventWorkspaceNav />
      <Panel />
      <WorkspaceSaveBar />
      <SeriesEditScopeDialog />
      <WorkspaceApplySetupDialog />
    </div>
  );
}

export function EventWorkspace({ eventId }: { eventId: Id<"events"> }) {
  const pathname = usePathname();
  const activeTab = activeTabFromPathname(pathname, eventId);
  return (
    <EventWorkspaceProvider eventId={eventId} activeTab={activeTab}>
      <WorkspaceBody />
    </EventWorkspaceProvider>
  );
}
