import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { BandApplicationsAdminClient } from "@/components/users/band-applications-admin-client";

export default function BandApplicationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Band applications</h1>
        <p className="text-sm text-muted-foreground">
          Review public artist applications. Approving creates the band org, invites the contact
          (and any listed members), and leaves payout onboarding for them to finish. Public listing
          stays off until they enable it.
        </p>
      </div>
      <ArborOnlyGuard>
        <AdminOnlyGuard>
          <BandApplicationsAdminClient />
        </AdminOnlyGuard>
      </ArborOnlyGuard>
    </div>
  );
}
