import { redirect } from "next/navigation";
import { PublicPackagesExplorer } from "@/components/public/public-packages-explorer";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";
import {
  PUBLIC_PACKAGE_BUCKETS,
  type PublicPackageBucket,
} from "@/lib/site-revalidation";

export const revalidate = 3600;

const buckets = new Set<PublicPackageBucket>(PUBLIC_PACKAGE_BUCKETS);

export function generateStaticParams() {
  return PUBLIC_PACKAGE_BUCKETS.map((bucket) => ({ bucket }));
}

export default async function PublicPackagesBucketPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  if (!buckets.has(bucket as PublicPackageBucket)) {
    redirect("/public/packages");
  }

  const rows = await fetchPublicQuerySafe(api.publicInventory.listPublicPackages, {
    bucket: bucket as PublicPackageBucket,
  }, []);

  return <PublicPackagesExplorer rows={rows} bucket={bucket as PublicPackageBucket} />;
}
