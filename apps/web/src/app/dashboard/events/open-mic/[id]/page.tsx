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
            Call performers up first-come, first-served. “Next” finishes the current performer and
            brings up the next; “Not here” sends them through the strike ladder.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <OpenMicRunner nightId={id as Id<"openMicNights">} />
      </ArborOnlyGuard>
    </div>
  );
}