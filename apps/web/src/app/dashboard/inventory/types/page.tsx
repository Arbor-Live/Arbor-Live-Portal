import { AdminOnlyGuard } from "@/components/org-context-guard";
import { TypesManager } from "@/components/inventory/types-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventory types",
};

export default function InventoryTypesPage() {
  return (
    <AdminOnlyGuard>
      <TypesManager />
    </AdminOnlyGuard>
  );
}
