import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CrewSchedulingDashboard } from "@/components/events/crew-scheduling-dashboard";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function CrewSchedulingPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Crew Scheduling</CardTitle>
          <CardDescription>
            Upcoming events that still need crew assigned, with availability response counts from team-matched crew.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <CrewSchedulingDashboard />
      </ArborOnlyGuard>
    </div>
  );
}
