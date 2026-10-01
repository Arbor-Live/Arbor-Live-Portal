import type { Metadata } from "next";
import { OpenMicRunner } from "@/components/events/open-mic-runner";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { api, type Id } from "@/lib/convex-api";
import { fetchAuthQuery } from "@/lib/auth-server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchAuthQuery(api.events.get, {
    id: id as Id<"events">,
    detail: "schedule",
  });
  const title = data?.event.title?.trim();
  return { title: title ? `${title} · Open Mic` : "Open Mic" };
}

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