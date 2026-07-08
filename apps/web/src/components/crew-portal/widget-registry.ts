import { PendingAvailabilityWidget } from "@/components/crew-portal/widgets/pending-availability-widget";
import { ScheduledEventsWidget } from "@/components/crew-portal/widgets/scheduled-events-widget";
import { EventsNeedingPhotosWidget } from "@/components/crew-portal/widgets/events-needing-photos-widget";
import { PayPeriodSummaryWidget } from "@/components/crew-portal/widgets/pay-period-summary-widget";
import type { DashboardWidgetDefinition } from "@/components/dashboard/customizable-widget-dashboard";

export type UserTeam = "Sound" | "Lights" | "Design" | "Marketing" | "Operations";

export type CrewWidget = DashboardWidgetDefinition & {
  teams?: UserTeam[];
};

const DEFAULT_CREW_WIDGETS: CrewWidget[] = [
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

export function getWidgetsForTeams(teams: UserTeam[]): CrewWidget[] {
  return DEFAULT_CREW_WIDGETS.filter((widget) => {
    if (!widget.teams?.length) return true;
    return widget.teams.some((team) => teams.includes(team));
  });
}
