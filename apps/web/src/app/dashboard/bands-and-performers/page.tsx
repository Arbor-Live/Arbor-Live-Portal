"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BandOrAdminGuard } from "@/components/org-context-guard";
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

export default function BandsAndPerformersPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bands and Performers</CardTitle>
          <CardDescription>
            Admins can edit any band&apos;s profile here. Band organizations manage their own
            profile, technical riders, and payments under this section.
          </CardDescription>
        </CardHeader>
      </Card>
      <BandOrAdminGuard>
        <BandsAndPerformersBody />
      </BandOrAdminGuard>
    </div>
  );
}
