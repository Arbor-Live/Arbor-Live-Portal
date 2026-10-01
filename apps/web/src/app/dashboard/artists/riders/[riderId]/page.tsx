import { BandOrAdminGuard } from "@/components/org-context-guard";
import { RiderEditorClient } from "@/components/riders/rider-editor-client";
import type { Id } from "@/lib/convex-api";

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
