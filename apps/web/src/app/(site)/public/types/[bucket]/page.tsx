import { redirect } from "next/navigation";
import { PublicTypesExplorer } from "@/components/public/public-types-explorer";
import { api } from "@/lib/convex-api";
import { fetchPublicQuery } from "@/lib/convex-server";
import {
  PUBLIC_PACKAGE_BUCKETS,
  type PublicPackageBucket,
} from "@/lib/site-revalidation";

export const revalidate = 3600;

const buckets = new Set<PublicPackageBucket>(PUBLIC_PACKAGE_BUCKETS);

export function generateStaticParams() {
  return PUBLIC_PACKAGE_BUCKETS.map((bucket) => ({ bucket }));
}

export default async function PublicTypesBucketPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  if (!buckets.has(bucket as PublicPackageBucket)) {
    redirect("/public/types");
  }

  const [rows, capabilityFilters] = await Promise.all([
    fetchPublicQuery(api.publicInventory.listPublicTypes, {
      bucket: bucket as PublicPackageBucket,
    }),
    fetchPublicQuery(api.publicInventory.listPublicCapabilityFilters, {}),
  ]);

  return (
    <PublicTypesExplorer
      rows={rows}
      capabilityFilters={capabilityFilters}
      bucket={bucket as PublicPackageBucket}
    />
  );
}
