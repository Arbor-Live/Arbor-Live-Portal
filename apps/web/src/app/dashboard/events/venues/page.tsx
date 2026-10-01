import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { VenuesManager } from "@/components/venues/venues-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Venues",
};

export default function VenuesPage() {
  return (
    <ArborOnlyGuard>
      <AdminOnlyGuard>
        <VenuesManager />
      </AdminOnlyGuard>
    </ArborOnlyGuard>
  );
}
