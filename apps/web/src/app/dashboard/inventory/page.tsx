import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const modules = [
  {
    title: "Inventory Items",
    href: "/dashboard/inventory/items",
    description: "Physical tracked assets with serial numbers and storage assignment.",
  },
  {
    title: "Types",
    href: "/dashboard/inventory/types",
    description: "Model database with pricing, manuals, capabilities, and imagery.",
  },
  {
    title: "Packages",
    href: "/dashboard/inventory/packages",
    description: "Collections of type + quantity bundles with package pricing.",
  },
  {
    title: "Storage Locations",
    href: "/dashboard/inventory/storage-locations",
    description: "Nested location hierarchy with materialized breadcrumb paths.",
  },
  {
    title: "Import CSV",
    href: "/dashboard/inventory/import",
    description: "One-time importer for Inventory Types and Assets CSV exports.",
  },
];

export default function InventoryOverviewPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Inventory Hub</CardTitle>
          <CardDescription>
            Global inventory data for assets, model types, pricing packages, and storage hierarchy.
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <Link href={module.href} key={module.href}>
            <Card className="h-full transition hover:bg-muted/50">
              <CardHeader>
                <CardTitle>{module.title}</CardTitle>
                <CardContent className="px-0 pb-0 text-muted-foreground">
                  {module.description}
                </CardContent>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
