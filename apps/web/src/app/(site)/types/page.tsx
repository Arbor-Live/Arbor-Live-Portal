import type { Metadata } from "next";
import { PublicTypesExplorer } from "@/components/public/public-types-explorer";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";

export const metadata: Metadata = {
  title: "Equipment types",
  description: "Reference specs for the equipment models Arbor Live rents.",
};

export const revalidate = 3600;

export default async function PublicTypesIndexPage() {
  const [rows, capabilityFilters] = await Promise.all([
    fetchPublicQuerySafe(api.publicInventory.listPublicTypes, {}, []),
    fetchPublicQuerySafe(api.publicInventory.listPublicCapabilityFilters, {}, []),
  ]);

  return <PublicTypesExplorer rows={rows} capabilityFilters={capabilityFilters} />;
}
