import { OpenMicRunner } from "@/components/events/open-mic-runner";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import type { Id } from "@/lib/convex-api";

export default async function OpenMicRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/events/open-mic", label: "Open Mic" }}
        title="Open Mic runner"
        description={
          "Call performers up first-come, first-served. \u201cNext\u201d finishes the current performer and brings up the next; \u201cNot here\u201d sends them through the strike ladder."
        }
      />
      <ArborOnlyGuard>
        <OpenMicRunner eventId={id as Id<"events">} />
      </ArborOnlyGuard>
    </div>
  );
}