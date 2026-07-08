"use client";

import { CustomizableWidgetDashboard } from "@/components/dashboard/customizable-widget-dashboard";
import { ADMIN_HOME_WIDGETS } from "@/components/admin-dashboard/widget-registry";

export function AdminDashboard() {
  return (
    <CustomizableWidgetDashboard
      dashboardKey="adminHome"
      title="Home"
      description="Your admin dashboard — upcoming work, staffing gaps, booking requests, and payouts."
      widgets={ADMIN_HOME_WIDGETS}
    />
  );
}
