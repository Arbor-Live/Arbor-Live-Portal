import { PendingAvailabilityWidget } from "@/components/crew-portal/widgets/pending-availability-widget";
import { ScheduledEventsWidget } from "@/components/crew-portal/widgets/scheduled-events-widget";
import { PostEventWorkWidget } from "@/components/crew-portal/widgets/post-event-work-widget";
import { PayPeriodSummaryWidget } from "@/components/crew-portal/widgets/pay-period-summary-widget";
import { BorrowRequestsWidget } from "@/components/crew-portal/widgets/borrow-requests-widget";
import { CohoGiftCardWidget } from "@/components/crew-portal/widgets/coho-gift-card-widget";
import type { DashboardWidgetDefinition } from "@/components/dashboard/customizable-widget-dashboard";

export type UserDiscipline =
  | "Sound"
  | "Lights"
  | "Design"
  | "Photography"
  | "Videography";

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
    id: "post-event-work",
    title: "Post-event work",
    component: PostEventWorkWidget,
  },
  {
    id: "pay-period-summary",
    title: "Pay periods",
    component: PayPeriodSummaryWidget,
  },
  {
    id: "coho-gift-card",
    title: "CoHo gift card",
    component: CohoGiftCardWidget,
  },
  {
    id: "borrow-requests",
    title: "Equipment requests",
    component: BorrowRequestsWidget,
  },
];

export function getWidgetsForDisciplines(disciplines: UserDiscipline[]): CrewWidget[] {
  return DEFAULT_CREW_WIDGETS.filter((widget) => {
    if (!widget.disciplines?.length) return true;
    return widget.disciplines.some((discipline) => disciplines.includes(discipline));
  });
}
