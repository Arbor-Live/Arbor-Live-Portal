import { PublicPackageDetailClient } from "@/components/public/public-package-detail-client";
import type { Id } from "@/lib/convex-api";

export default async function PublicPackageDetailPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  const { packageId } = await params;
  return <PublicPackageDetailClient packageId={packageId as Id<"inventoryPackages">} />;
}
