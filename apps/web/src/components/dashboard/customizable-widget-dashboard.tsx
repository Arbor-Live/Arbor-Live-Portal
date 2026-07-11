"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery } from "convex/react";
import { DotsSixVerticalIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function reorderIds(ids: string[], draggedId: string, targetId: string) {
  if (draggedId === targetId) return ids;
  const next = [...ids];
  const fromIndex = next.indexOf(draggedId);
  const toIndex = next.indexOf(targetId);
  if (fromIndex < 0 || toIndex < 0) return ids;
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, draggedId);
  return next;
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
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
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
  const visibleWidgets = useMemo(
    () =>
      widgetOrder
        .map((widgetId) => widgetsById.get(widgetId))
        .filter((widget): widget is DashboardWidgetDefinition => widget !== undefined)
        .filter((widget) => !hiddenWidgetIds.includes(widget.id)),
    [hiddenWidgetIds, widgetOrder, widgetsById],
  );

  async function persist(nextOrder: string[], nextHidden: string[]) {
    await savePreference({
      dashboardKey,
      widgetOrder: nextOrder,
      hiddenWidgetIds: nextHidden,
    });
  }

  async function handleToggleWidget(widgetId: string, checked: boolean) {
    const nextHidden = checked
      ? hiddenWidgetIds.filter((id) => id !== widgetId)
      : unique([...hiddenWidgetIds, widgetId]);
    await persist(widgetOrder, nextHidden);
  }

  async function handleResetLayout() {
    await resetPreference({ dashboardKey });
    setIsCustomizing(false);
  }

  async function handleDrop(targetId: string) {
    if (!draggedWidgetId) return;
    const nextOrder = reorderIds(widgetOrder, draggedWidgetId, targetId);
    setDraggedWidgetId(null);
    await persist(nextOrder, hiddenWidgetIds);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontalIcon className="size-4" />
                Widgets
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Visible widgets</DropdownMenuLabel>
              {widgets.map((widget) => (
                <DropdownMenuCheckboxItem
                  key={widget.id}
                  checked={!hiddenWidgetIds.includes(widget.id)}
                  onCheckedChange={(checked) =>
                    void handleToggleWidget(widget.id, checked === true)
                  }
                >
                  {widget.title}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleResetLayout()}>
                Reset layout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant={isCustomizing ? "default" : "outline"}
            size="sm"
            onClick={() => setIsCustomizing((current) => !current)}
          >
            {isCustomizing ? "Done" : "Customize"}
          </Button>
        </div>
      </div>

      {isCustomizing ? (
        <p className="text-xs text-muted-foreground">
          Drag cards to reorder them. Use the Widgets menu to hide or restore cards.
        </p>
      ) : null}

      {visibleWidgets.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No widgets are visible. Use the Widgets menu to restore them.
        </div>
      ) : (
        <div
          className={cn(
            isCustomizing ? "grid gap-4 md:grid-cols-2" : "columns-1 gap-4 md:columns-2",
          )}
        >
          {visibleWidgets.map((widget) => {
            const Widget = widget.component;
            return (
              <div
                key={widget.id}
                draggable={isCustomizing}
                onDragStart={() => setDraggedWidgetId(widget.id)}
                onDragEnd={() => setDraggedWidgetId(null)}
                onDragOver={(event) => {
                  if (!isCustomizing) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!isCustomizing) return;
                  event.preventDefault();
                  void handleDrop(widget.id);
                }}
                className={cn(
                  "transition-opacity",
                  isCustomizing ? "" : "mb-4 break-inside-avoid",
                  isCustomizing ? "cursor-grab" : "",
                  draggedWidgetId === widget.id ? "opacity-50" : "",
                )}
              >
                {isCustomizing ? (
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <DotsSixVerticalIcon className="size-4" />
                    <span>{widget.title}</span>
                  </div>
                ) : null}
                <Widget />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
