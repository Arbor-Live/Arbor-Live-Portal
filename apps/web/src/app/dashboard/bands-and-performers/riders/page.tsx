"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BandOrAdminGuard } from "@/components/org-context-guard";
import { RiderListClient } from "@/components/riders/rider-list-client";
import { AdminBandPickerCard } from "@/components/bands/admin-band-selection";

export default function BandRidersPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Technical rider</CardTitle>
          <CardDescription>
            Build a stage plot, input list, and monitor mixes. Export a PDF to share with
            production — or keep it as your default for show files.
          </CardDescription>
        </CardHeader>
      </Card>
      <BandOrAdminGuard>
        <div className="space-y-4">
          <AdminBandPickerCard />
          <RiderListClient />
        </div>
      </BandOrAdminGuard>
    </div>
  );
}
