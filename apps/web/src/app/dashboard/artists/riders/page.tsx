"use client";

import { BandOrAdminGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { RiderListClient } from "@/components/riders/rider-list-client";
import { AdminBandPickerCard } from "@/components/bands/admin-band-selection";

export default function BandRidersPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/artists", label: "Artists" }}
        title="Technical rider"
        description="Build a stage plot, input list, and monitor mixes. Export a PDF to share with production — or keep it as your default for show files."
      />
      <BandOrAdminGuard>
        <div className="space-y-4">
          <AdminBandPickerCard />
          <RiderListClient />
        </div>
      </BandOrAdminGuard>
    </div>
  );
}
