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
            Crewed events in your selected date range (default: next two weeks), with availability response counts from team-matched crew.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <CrewSchedulingDashboard />
      </ArborOnlyGuard>
    </div>
  );
}
