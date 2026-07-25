import { AdminOnlyGuard } from "@/components/org-context-guard";
import { CsvImporter } from "@/components/inventory/csv-importer";

export default function InventoryImportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Import Inventory CSVs</h1>
      <AdminOnlyGuard>
        <CsvImporter />
      </AdminOnlyGuard>
    </div>
  );
}
