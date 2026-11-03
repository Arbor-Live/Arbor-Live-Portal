import type { Metadata } from "next";
import { OpenMicRunner } from "@/components/events/open-mic-runner";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { api, type Id } from "@/lib/convex-api";
import { fetchAuthQueryOrNull } from "@/lib/auth-server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchAuthQueryOrNull(api.events.get, {
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
    <ArborOnlyGuard>
      <OpenMicRunner eventId={id as Id<"events">} />
    </ArborOnlyGuard>
  );
}
