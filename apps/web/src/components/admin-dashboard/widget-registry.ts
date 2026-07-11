import type { DashboardWidgetDefinition } from "@/components/dashboard/customizable-widget-dashboard";
import { DEFAULT_CREW_WIDGETS } from "@/components/crew-portal/widget-registry";
import { AdminBookingRequestsWidget } from "@/components/admin-dashboard/widgets/admin-booking-requests-widget";
import { AdminCrewingAttentionWidget } from "@/components/admin-dashboard/widgets/admin-crewing-attention-widget";
import { AdminPayoutQueueWidget } from "@/components/admin-dashboard/widgets/admin-payout-queue-widget";
import { AdminUpcomingEventsWidget } from "@/components/admin-dashboard/widgets/admin-upcoming-events-widget";

export const ADMIN_HOME_WIDGETS: DashboardWidgetDefinition[] = [
  {
    id: "admin-upcoming-events",
    title: "Upcoming events",
    component: AdminUpcomingEventsWidget,
  },
  {
    id: "admin-crewing-attention",
    title: "Crewing attention",
    component: AdminCrewingAttentionWidget,
  },
  {
    id: "admin-booking-requests",
    title: "Booking requests",
    component: AdminBookingRequestsWidget,
  },
  {
    id: "admin-payout-queue",
    title: "Band payout queue",
    component: AdminPayoutQueueWidget,
  },
  ...DEFAULT_CREW_WIDGETS,
];
