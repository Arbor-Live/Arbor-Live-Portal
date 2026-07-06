import { PublicTypesExplorer } from "@/components/public/public-types-explorer";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";
export const revalidate = 3600;

export default async function PublicTypesIndexPage() {
  const [rows, capabilityFilters] = await Promise.all([
    fetchPublicQuerySafe(api.publicInventory.listPublicTypes, {}, []),
    fetchPublicQuerySafe(api.publicInventory.listPublicCapabilityFilters, {}, []),
  ]);

  return <PublicTypesExplorer rows={rows} capabilityFilters={capabilityFilters} />;
}
