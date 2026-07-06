import { PublicPackagesExplorer } from "@/components/public/public-packages-explorer";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";
export const revalidate = 3600;

export default async function PublicPackagesIndexPage() {
  const rows = await fetchPublicQuerySafe(api.publicInventory.listPublicPackages, {}, []);
  return <PublicPackagesExplorer rows={rows} />;
}
