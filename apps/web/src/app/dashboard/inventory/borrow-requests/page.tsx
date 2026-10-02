import { EquipmentBorrowRequestsClient } from "@/components/inventory/equipment-borrow-requests-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Borrow requests",
};

export default function InventoryBorrowRequestsPage() {
  return <EquipmentBorrowRequestsClient />;
}
