import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { BandApplicationsAdminClient } from "@/components/users/band-applications-admin-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Artist applications",
};

export default function BandApplicationsPage() {
  return (
    <ArborOnlyGuard>
      <AdminOnlyGuard>
        <BandApplicationsAdminClient />
      </AdminOnlyGuard>
    </ArborOnlyGuard>
  );
}
