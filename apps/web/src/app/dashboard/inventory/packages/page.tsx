import { PackagesManager } from "@/components/inventory/packages-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Packages",
};

export default function InventoryPackagesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Packages</h1>
      <PackagesManager />
    </div>
  );
}
