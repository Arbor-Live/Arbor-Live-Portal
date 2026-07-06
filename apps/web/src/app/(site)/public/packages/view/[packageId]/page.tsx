import type { Metadata } from "next";
import {
  PublicPackageDetailContent,
  PublicPackageUnavailable,
} from "@/components/public/public-package-detail-content";
import { api, type Id } from "@/lib/convex-api";
import { fetchPublicQuery, fetchPublicQueryForStaticParams } from "@/lib/convex-server";
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const packages = await fetchPublicQueryForStaticParams(
    api.publicInventory.listPublicPackages,
    {},
    [],
  );
  return packages.map((row) => ({ packageId: row.package._id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ packageId: string }>;
}): Promise<Metadata> {
  const { packageId } = await params;
  const data = await fetchPublicQuery(api.publicInventory.getPublicPackage, {
    packageId: packageId as Id<"inventoryPackages">,
  });

  if (!data) {
    return {
      title: "Package not available | Arbor Live",
    };
  }

  return {
    title: `${data.package.name} | Arbor Live`,
    description: data.package.description ?? "Public equipment package from Arbor Live.",
  };
}

export default async function PublicPackageDetailPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  const { packageId } = await params;
  const [data, capabilityFilters] = await Promise.all([
    fetchPublicQuery(api.publicInventory.getPublicPackage, {
      packageId: packageId as Id<"inventoryPackages">,
    }),
    fetchPublicQuery(api.publicInventory.listPublicCapabilityFilters, {}),
  ]);

  if (!data) {
    return <PublicPackageUnavailable />;
  }

  return <PublicPackageDetailContent data={data} capabilityFilters={capabilityFilters} />;
}
