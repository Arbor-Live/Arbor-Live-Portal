import { EquipmentBorrowRequestsClient } from "@/components/inventory/equipment-borrow-requests-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Borrow requests",
};

export default function InventoryBorrowRequestsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Borrow Requests</h1>
      <EquipmentBorrowRequestsClient />
    </div>
  );
}
