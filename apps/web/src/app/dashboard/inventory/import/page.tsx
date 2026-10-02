import { AdminOnlyGuard } from "@/components/org-context-guard";
import { CsvImporter } from "@/components/inventory/csv-importer";
import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Import inventory",
};

export default function InventoryImportPage() {
  return (
    <div className="space-y-4 pb-24" data-testid="inventory-import-page">
      <PageHeader
        title="Import inventory"
        description="Bring types and tagged items in from spreadsheet exports. A row that matches an existing type name or asset ID updates it instead of adding a duplicate."
      />
      <AdminOnlyGuard>
        <CsvImporter />
      </AdminOnlyGuard>
    </div>
  );
}
