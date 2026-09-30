import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { VenuesManager } from "@/components/venues/venues-manager";

export default function VenuesPage() {
  return (
    <ArborOnlyGuard>
      <AdminOnlyGuard>
        <VenuesManager />
      </AdminOnlyGuard>
    </ArborOnlyGuard>
  );
}
