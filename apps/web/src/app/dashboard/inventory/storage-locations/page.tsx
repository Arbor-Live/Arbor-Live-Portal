import { StorageLocationsManager } from "@/components/inventory/storage-locations-manager";

export default function InventoryStorageLocationsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Storage Locations</h1>
      <StorageLocationsManager />
    </div>
  );
}
