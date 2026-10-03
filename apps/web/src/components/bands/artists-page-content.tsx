"use client";

import { BandSelfServiceClient } from "@/components/bands/band-self-service-client";
import { AdminBandProfileClient } from "@/components/bands/admin-band-profile-client";
import { useAdminBandSelection } from "@/components/bands/admin-band-selection";

/** The Profile tab of the act workspace (the header and tabs come from the layout). */
export function ArtistsPageContent() {
  const { isAdminManaging, organizationId } = useAdminBandSelection();

  return isAdminManaging ? (
    <AdminBandProfileClient key={organizationId ?? "none"} />
  ) : (
    <BandSelfServiceClient />
  );
}
