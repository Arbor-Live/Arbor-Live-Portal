"use client";

import { CustomizableWidgetDashboard } from "@/components/dashboard/customizable-widget-dashboard";
import { ADMIN_HOME_WIDGETS } from "@/components/admin-dashboard/widget-registry";

export function AdminDashboard() {
  return (
    <CustomizableWidgetDashboard
      dashboardKey="adminHome"
      title="Home"
      description="Upcoming events and what they still need, plus booking requests, artist payouts, and repairs."
      widgets={ADMIN_HOME_WIDGETS}
    />
  );
}
