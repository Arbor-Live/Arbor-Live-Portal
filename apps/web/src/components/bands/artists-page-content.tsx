"use client";

import { BandOrAdminGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { BandSelfServiceClient } from "@/components/bands/band-self-service-client";
import { AdminBandProfileClient } from "@/components/bands/admin-band-profile-client";
import {
  AdminBandPickerCard,
  useAdminBandSelection,
} from "@/components/bands/admin-band-selection";

function BandsAndPerformersBody() {
  const { isAdminManaging, organizationId } = useAdminBandSelection();

  return (
    <>
      <AdminBandPickerCard />
      {isAdminManaging ? (
        <AdminBandProfileClient key={organizationId ?? "none"} />
      ) : (
        <BandSelfServiceClient />
      )}
    </>
  );
}

export function ArtistsPageContent() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Artists"
        description="Admins can edit any artist's profile here. Artist organizations manage their own profile, technical riders, and payments under this section."
      />
      <BandOrAdminGuard>
        <BandsAndPerformersBody />
      </BandOrAdminGuard>
    </div>
  );
}
