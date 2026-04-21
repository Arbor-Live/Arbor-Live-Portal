import { redirect } from "next/navigation";
import { PublicPackagesExplorer } from "@/components/public/public-packages-explorer";

type Bucket = "lighting" | "sound" | "environmental" | "staging" | "misc";
const buckets = new Set<Bucket>(["lighting", "sound", "environmental", "staging", "misc"]);

export default async function PublicPackagesBucketPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  if (!buckets.has(bucket as Bucket)) {
    redirect("/public/packages");
  }

  return <PublicPackagesExplorer bucket={bucket as Bucket} />;
}
