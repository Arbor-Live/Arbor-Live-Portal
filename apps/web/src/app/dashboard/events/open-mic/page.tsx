import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OpenMicNightsInbox } from "@/components/events/open-mic-nights-inbox";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function OpenMicPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Open Mic</CardTitle>
          <CardDescription>
            Run first-come, first-served sign-ups for open mic nights. Create a night, then open the
            runner to call performers up one at a time.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <OpenMicNightsInbox />
      </ArborOnlyGuard>
    </div>
  );
}