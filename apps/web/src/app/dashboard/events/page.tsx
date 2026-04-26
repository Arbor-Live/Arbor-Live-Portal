import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EventDatabaseManager } from "@/components/events/event-database-manager";

export default function EventsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            Manage event lifecycle data, shifts, artifacts, and expense-linked crew hours.
          </CardDescription>
        </CardHeader>
      </Card>
      <EventDatabaseManager />
    </div>
  );
}
