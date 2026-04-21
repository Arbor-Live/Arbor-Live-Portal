import { ItemsManager } from "@/components/inventory/items-manager";

export default function InventoryItemsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Inventory Items</h1>
      <ItemsManager />
    </div>
  );
}
