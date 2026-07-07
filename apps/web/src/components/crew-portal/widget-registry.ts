import type { ComponentType } from "react";
import { PendingAvailabilityWidget } from "@/components/crew-portal/widgets/pending-availability-widget";
import { ScheduledEventsWidget } from "@/components/crew-portal/widgets/scheduled-events-widget";
import { EventsNeedingPhotosWidget } from "@/components/crew-portal/widgets/events-needing-photos-widget";
import { PayPeriodSummaryWidget } from "@/components/crew-portal/widgets/pay-period-summary-widget";

export type UserTeam = "Sound" | "Lights" | "Design" | "Marketing" | "Operations";

export type CrewWidget = {
  id: string;
  component: ComponentType;
  teams?: UserTeam[];
};

const DEFAULT_CREW_WIDGETS: CrewWidget[] = [
  { id: "pending-availability", component: PendingAvailabilityWidget },
  { id: "scheduled-events", component: ScheduledEventsWidget },
  { id: "needs-photos", component: EventsNeedingPhotosWidget },
  { id: "pay-period-summary", component: PayPeriodSummaryWidget },
];

export function getWidgetsForTeams(teams: UserTeam[]): CrewWidget[] {
  return DEFAULT_CREW_WIDGETS.filter((widget) => {
    if (!widget.teams?.length) return true;
    return widget.teams.some((team) => teams.includes(team));
  });
}
