import type { Metadata } from "next";
import { BandOrAdminGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { RiderEditorClient } from "@/components/riders/rider-editor-client";
import { api, type Id } from "@/lib/convex-api";
import { fetchAuthQuery } from "@/lib/auth-server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ riderId: string }>;
}): Promise<Metadata> {
  const { riderId } = await params;
  const rider = await fetchAuthQuery(api.bandRiders.get, {
    riderId: riderId as Id<"bandRiders">,
  });
  const name = rider?.name?.trim();
  return { title: name ? `${name} · Technical rider` : "Technical rider" };
}

export default async function BandRiderEditorPage({
  params,
}: {
  params: Promise<{ riderId: string }>;
}) {
  const { riderId } = await params;

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        back={{ href: "/dashboard/artists/riders", label: "Technical rider" }}
        title="Edit technical rider"
        description="Drag symbols onto the stage. Channels and monitor mixes update as you place gear."
      />
      <BandOrAdminGuard>
        <RiderEditorClient riderId={riderId as Id<"bandRiders">} />
      </BandOrAdminGuard>
    </div>
  );
}
