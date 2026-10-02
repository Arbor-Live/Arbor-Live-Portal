import { PackagesManager } from "@/components/inventory/packages-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Packages",
};

export default function InventoryPackagesPage() {
  return <PackagesManager />;
}
