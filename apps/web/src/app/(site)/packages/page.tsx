import type { Metadata } from "next";
import { PublicPackagesExplorer } from "@/components/public/public-packages-explorer";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";

export const metadata: Metadata = {
  title: "Equipment packages",
  description: "Browse rental packages from Arbor Live.",
};

export const revalidate = 3600;

export default async function PublicPackagesIndexPage() {
  const rows = await fetchPublicQuerySafe(api.publicInventory.listPublicPackages, {}, []);
  return <PublicPackagesExplorer rows={rows} />;
}
