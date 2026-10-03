"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery } from "convex/react";
import { DotsSixVerticalIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { EmptyState } from "@/components/list-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SortableList } from "@/components/ui/sortable-list";
import { Switch } from "@/components/ui/switch";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export type DashboardWidgetKey = "crewHome" | "adminHome";

export type DashboardWidgetDefinition = {
  id: string;
  title: string;
  component: ComponentType;
};

function unique(ids: string[]) {
  return Array.from(new Set(ids));
}

function normalizePreference(
  widgets: DashboardWidgetDefinition[],
  preference:
    | {
        widgetOrder: string[];
        hiddenWidgetIds: string[];
      }
    | null
    | undefined,
) {
  const validIds = new Set(widgets.map((widget) => widget.id));
  const widgetOrder = unique(
    [...(preference?.widgetOrder ?? []), ...widgets.map((widget) => widget.id)].filter((id) =>
      validIds.has(id),
    ),
  );
  const hiddenWidgetIds = unique(
    (preference?.hiddenWidgetIds ?? []).filter((id) => validIds.has(id)),
  );
  return { widgetOrder, hiddenWidgetIds };
}

export function CustomizableWidgetDashboard({
  dashboardKey,
  title,
  description,
  widgets,
}: {
  dashboardKey: DashboardWidgetKey;
  title: string;
  description: string;
  widgets: DashboardWidgetDefinition[];
}) {
  const preference = useQuery(api.dashboardPreferences.getMyDashboardPreference, {
    dashboardKey,
  });
  const savePreference = useMutation(api.dashboardPreferences.saveMyDashboardPreference);
  const resetPreference = useMutation(api.dashboardPreferences.resetMyDashboardPreference);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const normalizedPreference = useMemo(
    () => normalizePreference(widgets, preference),
    [preference, widgets],
  );
  const widgetOrder = normalizedPreference.widgetOrder;
  const hiddenWidgetIds = normalizedPreference.hiddenWidgetIds;

  const widgetsById = useMemo(
    () => new Map(widgets.map((widget) => [widget.id, widget])),
    [widgets],
  );
  const orderedWidgets = useMemo(
    () =>
      widgetOrder
        .map((widgetId) => widgetsById.get(widgetId))
        .filter((widget): widget is DashboardWidgetDefinition => widget !== undefined),
    [widgetOrder, widgetsById],
  );
  const visibleWidgets = orderedWidgets.filter((widget) => !hiddenWidgetIds.includes(widget.id));

  async function persist(nextOrder: string[], nextHidden: string[]) {
    try {
      await savePreference({
        dashboardKey,
        widgetOrder: nextOrder,
        hiddenWidgetIds: nextHidden,
      });
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function handleToggleWidget(widgetId: string, shown: boolean) {
    const nextHidden = shown
      ? hiddenWidgetIds.filter((id) => id !== widgetId)
      : unique([...hiddenWidgetIds, widgetId]);
    await persist(widgetOrder, nextHidden);
  }

  async function handleResetLayout() {
    try {
      await resetPreference({ dashboardKey });
      setIsCustomizing(false);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  return (
    <div className="space-y-4 pb-24" data-testid={`${dashboardKey}-dashboard`}>
      <PageHeader
        title={title}
        description={description}
        actions={
          isCustomizing ? (
            <Button size="sm" onClick={() => setIsCustomizing(false)}>
              Done
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setIsCustomizing(true)}>
              <SlidersHorizontalIcon />
              Customize
            </Button>
          )
        }
        menu={
          <DropdownMenuItem onSelect={() => void handleResetLayout()}>Reset layout</DropdownMenuItem>
        }
      />

      {isCustomizing ? (
        <div className="space-y-2" data-testid="dashboard-customize">
          <p className="text-sm text-muted-foreground">
            Drag to reorder. Switch off what you don&apos;t need; changes save as you go.
          </p>
          <SortableList
            items={orderedWidgets}
            getId={(widget) => widget.id}
            onReorder={(_, orderedIds) => void persist(orderedIds, hiddenWidgetIds)}
            rowClassName="flex items-center gap-2 border bg-background py-1.5 pr-3 pl-1 text-sm"
            rowTestId="dashboard-customize-row"
            renderItem={(widget, _index, controls) => {
              const shown = !hiddenWidgetIds.includes(widget.id);
              const switchId = `${dashboardKey}-widget-${widget.id}`;
              return (
                <>
                  <span
                    {...controls.handleProps}
                    className="flex size-8 cursor-grab touch-none items-center justify-center text-muted-foreground"
                    aria-hidden
                  >
                    <DotsSixVerticalIcon className="size-4" />
                  </span>
                  <label htmlFor={switchId} className={cn("min-w-0 flex-1 truncate font-medium", !shown && "text-muted-foreground")}>
                    {widget.title}
                  </label>
                  <Switch
                    id={switchId}
                    checked={shown}
                    onCheckedChange={(checked) => void handleToggleWidget(widget.id, checked)}
                    aria-label={`Show ${widget.title}`}
                  />
                </>
              );
            }}
          />
        </div>
      ) : visibleWidgets.length === 0 ? (
        <EmptyState
          action={
            <Button variant="outline" size="sm" onClick={() => setIsCustomizing(true)}>
              Customize
            </Button>
          }
        >
          Every widget is hidden. Customize the page to bring some back.
        </EmptyState>
      ) : (
        <div className="columns-1 gap-4 md:columns-2">
          {visibleWidgets.map((widget) => {
            const Widget = widget.component;
            return (
              <div key={widget.id} className="mb-4 break-inside-avoid">
                <Widget />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
