import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { CrewApplicationsAdminClient } from "@/components/users/crew-applications-admin-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crew applications",
};

export default function CrewApplicationsPage() {
  return (
    <ArborOnlyGuard>
      <AdminOnlyGuard>
        <CrewApplicationsAdminClient />
      </AdminOnlyGuard>
    </ArborOnlyGuard>
  );
}
