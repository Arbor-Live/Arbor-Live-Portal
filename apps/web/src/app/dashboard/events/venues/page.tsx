import { ArborOnlyGuard } from "@/components/org-context-guard";
import { VenuesManager } from "@/components/venues/venues-manager";

export default function VenuesPage() {
  return (
    <ArborOnlyGuard>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Venues</h1>
          <p className="text-sm text-muted-foreground">
            Manage buildings and event spaces. Nest spaces under buildings, or keep standalone
            outdoor locations. Admin only.
          </p>
        </div>
        <VenuesManager />
      </div>
    </ArborOnlyGuard>
  );
}
