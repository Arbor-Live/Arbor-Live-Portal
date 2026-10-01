import type { Metadata } from "next";
import { BandOrAdminGuard } from "@/components/org-context-guard";
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
    <div className="pb-24">
      <BandOrAdminGuard>
        <RiderEditorClient riderId={riderId as Id<"bandRiders">} />
      </BandOrAdminGuard>
    </div>
  );
}
