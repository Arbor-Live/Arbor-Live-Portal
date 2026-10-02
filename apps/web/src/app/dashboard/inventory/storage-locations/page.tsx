import { StorageLocationsManager } from "@/components/inventory/storage-locations-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Storage locations",
};

export default function InventoryStorageLocationsPage() {
  return <StorageLocationsManager />;
}
