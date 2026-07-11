import { PendingAvailabilityWidget } from "@/components/crew-portal/widgets/pending-availability-widget";
import { ScheduledEventsWidget } from "@/components/crew-portal/widgets/scheduled-events-widget";
import { EventsNeedingPhotosWidget } from "@/components/crew-portal/widgets/events-needing-photos-widget";
import { PayPeriodSummaryWidget } from "@/components/crew-portal/widgets/pay-period-summary-widget";
import type { DashboardWidgetDefinition } from "@/components/dashboard/customizable-widget-dashboard";

export type UserDiscipline = "Sound" | "Lights" | "Design";

export type CrewWidget = DashboardWidgetDefinition & {
  disciplines?: UserDiscipline[];
};

export const DEFAULT_CREW_WIDGETS: CrewWidget[] = [
  {
    id: "pending-availability",
    title: "Availability",
    component: PendingAvailabilityWidget,
  },
  {
    id: "scheduled-events",
    title: "Upcoming shifts",
    component: ScheduledEventsWidget,
  },
  {
    id: "needs-photos",
    title: "Event photos",
    component: EventsNeedingPhotosWidget,
  },
  {
    id: "pay-period-summary",
    title: "Pay periods",
    component: PayPeriodSummaryWidget,
  },
];

export function getWidgetsForDisciplines(disciplines: UserDiscipline[]): CrewWidget[] {
  return DEFAULT_CREW_WIDGETS.filter((widget) => {
    if (!widget.disciplines?.length) return true;
    return widget.disciplines.some((discipline) => disciplines.includes(discipline));
  });
}

/** @deprecated Use getWidgetsForDisciplines */
export function getWidgetsForTeams(teams: string[]): CrewWidget[] {
  const disciplines = teams.filter((team): team is UserDiscipline =>
    team === "Sound" || team === "Lights" || team === "Design",
  );
  return getWidgetsForDisciplines(disciplines);
}
