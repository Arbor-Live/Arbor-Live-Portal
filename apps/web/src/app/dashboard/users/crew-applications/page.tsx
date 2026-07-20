import { ArborOnlyGuard } from "@/components/org-context-guard";
import { CrewApplicationsAdminClient } from "@/components/users/crew-applications-admin-client";

export default function CrewApplicationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Crew applications</h1>
        <p className="text-sm text-muted-foreground">
          Review public crew join requests. Assign trainees (calendar + intro email, no portal
          login) or convert applicants into Arbor Live members with a full invite.
        </p>
      </div>
      <ArborOnlyGuard>
        <CrewApplicationsAdminClient />
      </ArborOnlyGuard>
    </div>
  );
}
