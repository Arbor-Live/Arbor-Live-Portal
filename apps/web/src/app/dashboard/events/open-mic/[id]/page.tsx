import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OpenMicRunner } from "@/components/events/open-mic-runner";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import type { Id } from "@/lib/convex-api";

export default async function OpenMicRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Open Mic runner</CardTitle>
          <CardDescription>
            Call performers up first-come, first-served. &ldquo;Next&rdquo; finishes the current
            performer and brings up the next; &ldquo;Not here&rdquo; sends them through the strike
            ladder.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <OpenMicRunner eventId={id as Id<"events">} />
      </ArborOnlyGuard>
    </div>
  );
}