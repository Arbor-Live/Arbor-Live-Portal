import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicTypesExplorer } from "@/components/public/public-types-explorer";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";
import { publicBucketLabels as bucketLabels } from "@/components/inventory/package-section-utils";
import {
  PUBLIC_PACKAGE_BUCKETS,
  type PublicPackageBucket,
} from "@/lib/site-revalidation";

export const revalidate = 3600;

const buckets = new Set<PublicPackageBucket>(PUBLIC_PACKAGE_BUCKETS);

export function generateStaticParams() {
  return PUBLIC_PACKAGE_BUCKETS.map((bucket) => ({ bucket }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bucket: string }>;
}): Promise<Metadata> {
  const { bucket } = await params;
  if (!buckets.has(bucket as PublicPackageBucket)) return { title: "Equipment types" };
  const label = bucketLabels[bucket as PublicPackageBucket];
  return { title: `${label} model types` };
}

export default async function PublicTypesBucketPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  if (!buckets.has(bucket as PublicPackageBucket)) {
    redirect("/types");
  }

  const [rows, capabilityFilters] = await Promise.all([
    fetchPublicQuerySafe(api.publicInventory.listPublicTypes, {
      bucket: bucket as PublicPackageBucket,
    }, []),
    fetchPublicQuerySafe(api.publicInventory.listPublicCapabilityFilters, {}, []),
  ]);

  return (
    <PublicTypesExplorer
      rows={rows}
      capabilityFilters={capabilityFilters}
      bucket={bucket as PublicPackageBucket}
    />
  );
}
