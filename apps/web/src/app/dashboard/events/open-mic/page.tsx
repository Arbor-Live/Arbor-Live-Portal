import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OpenMicEventsInbox } from "@/components/events/open-mic-nights-inbox";
import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";

export default function OpenMicPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Open Mic</CardTitle>
          <CardDescription>
            Run first-come, first-served sign-ups for Open Mic. Enable the Open Mic add-on on an
            event, then open the runner to call performers up one at a time.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <AdminOnlyGuard>
          <OpenMicEventsInbox />
        </AdminOnlyGuard>
      </ArborOnlyGuard>
    </div>
  );
}