import { TypesManager } from "@/components/inventory/types-manager";

export default function InventoryTypesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Types</h1>
      <TypesManager />
    </div>
  );
}
