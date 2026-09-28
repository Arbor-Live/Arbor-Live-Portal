import { BookingRequestSettingsClient } from "@/components/events/booking-request-settings-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";

export default function BookingRequestSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/financial-hub/requests", label: "Booking Requests" }}
        title="Booking request settings"
        description="Configure who receives new booking requests in round-robin order."
      />
      <ArborOnlyGuard>
        <BookingRequestSettingsClient />
      </ArborOnlyGuard>
    </div>
  );
}
