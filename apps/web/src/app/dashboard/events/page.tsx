import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EventsMainPageClient } from "@/components/events/events-main-page-client";

export default function EventsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            Track your event calendar and monitor upcoming event states in one place.
          </CardDescription>
        </CardHeader>
      </Card>
      <EventsMainPageClient />
    </div>
  );
}
