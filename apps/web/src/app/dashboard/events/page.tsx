import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EventsListClient } from "@/components/events/events-list-client";

export default function EventsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            Browse events, filter quickly, and jump into dedicated edit workspaces.
          </CardDescription>
        </CardHeader>
      </Card>
      <EventsListClient />
    </div>
  );
}
