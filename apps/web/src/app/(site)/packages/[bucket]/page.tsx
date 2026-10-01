import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicPackagesExplorer } from "@/components/public/public-packages-explorer";
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
  if (!buckets.has(bucket as PublicPackageBucket)) return { title: "Equipment packages" };
  const label = bucketLabels[bucket as PublicPackageBucket];
  return { title: `${label} packages` };
}

export default async function PublicPackagesBucketPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  if (!buckets.has(bucket as PublicPackageBucket)) {
    redirect("/packages");
  }

  const rows = await fetchPublicQuerySafe(api.publicInventory.listPublicPackages, {
    bucket: bucket as PublicPackageBucket,
  }, []);

  return <PublicPackagesExplorer rows={rows} bucket={bucket as PublicPackageBucket} />;
}
