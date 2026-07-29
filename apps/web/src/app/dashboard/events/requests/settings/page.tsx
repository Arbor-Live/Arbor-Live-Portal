import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookingRequestSettingsClient } from "@/components/events/booking-request-settings-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function BookingRequestSettingsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Booking request settings</CardTitle>
          <CardDescription>
            Configure who receives new booking requests in round-robin order.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <BookingRequestSettingsClient />
      </ArborOnlyGuard>
    </div>
  );
}
