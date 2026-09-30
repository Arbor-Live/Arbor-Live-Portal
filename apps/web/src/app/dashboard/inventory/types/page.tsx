import { AdminOnlyGuard } from "@/components/org-context-guard";
import { TypesManager } from "@/components/inventory/types-manager";

export default function InventoryTypesPage() {
  return (
    <AdminOnlyGuard>
      <TypesManager />
    </AdminOnlyGuard>
  );
}
