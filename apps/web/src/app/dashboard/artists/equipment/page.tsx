import { BandOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { EquipmentBorrowRequestsClient } from "@/components/inventory/equipment-borrow-requests-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Equipment",
};

export default function BandEquipmentPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/artists", label: "Artists" }}
        title="Equipment"
        description="Borrow Arbor Live equipment for practices or events you host. Loans come with no support, and you're responsible for the gear."
      />
      <BandOnlyGuard>
        <EquipmentBorrowRequestsClient variant="artist" />
      </BandOnlyGuard>
    </div>
  );
}
