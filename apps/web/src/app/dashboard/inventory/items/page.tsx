import { ItemsManager } from "@/components/inventory/items-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventory items",
};

export default function InventoryItemsPage() {
  return <ItemsManager />;
}
