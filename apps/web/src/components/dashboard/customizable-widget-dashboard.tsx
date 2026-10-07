"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery } from "convex/react";
import { DotsSixVerticalIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { EmptyState } from "@/components/list-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
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
  /** Off until the viewer switches it on in Customize (no saved layout yet). */
  hiddenByDefault?: boolean;
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
  // A saved layout is the viewer's own choice; only fall back to the
  // registry's defaults before they've customized anything.
  const savedHidden =
    preference === null || preference === undefined
      ? widgets.filter((widget) => widget.hiddenByDefault).map((widget) => widget.id)
      : preference.hiddenWidgetIds;
  const hiddenWidgetIds = unique(savedHidden.filter((id) => validIds.has(id)));
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
  const { confirm } = useAppDialog();
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
    const ok = await confirm({
      title: "Reset Home to the default widgets?",
      confirmLabel: "Reset layout",
    });
    if (!ok) return;
    try {
      await resetPreference({ dashboardKey });
      setIsCustomizing(false);
      notify.success("Layout reset.");
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
        // Two columns filled alternately, so the page reads left to right in
        // the Customize order (CSS columns read top to bottom). On phones the
        // column wrappers dissolve (`contents`) and `order` restores the list.
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {[0, 1].map((column) => (
            <div key={column} className="contents md:flex md:min-w-0 md:flex-col md:gap-4">
              {visibleWidgets.map((widget, index) => {
                if (index % 2 !== column) return null;
                const Widget = widget.component;
                return (
                  // `empty:hidden`: a widget with nothing to show (CoHo card)
                  // renders null and shouldn't leave a gap.
                  <div key={widget.id} className="min-w-0 empty:hidden md:order-none" style={{ order: index }}>
                    <Widget />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
