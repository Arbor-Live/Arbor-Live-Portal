import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>Edit technical rider</CardTitle>
          <CardDescription>
            Drag symbols onto the stage. Channels and monitor mixes update as you place gear.
          </CardDescription>
        </CardHeader>
      </Card>
      <BandOrAdminGuard>
        <RiderEditorClient riderId={riderId as Id<"bandRiders">} />
      </BandOrAdminGuard>
    </div>
  );
}
