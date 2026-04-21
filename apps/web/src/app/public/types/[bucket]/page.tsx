import { redirect } from "next/navigation";
import { PublicTypesExplorer } from "@/components/public/public-types-explorer";

type Bucket = "lighting" | "sound" | "environmental" | "staging" | "misc";
const buckets = new Set<Bucket>(["lighting", "sound", "environmental", "staging", "misc"]);

export default async function PublicTypesBucketPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  if (!buckets.has(bucket as Bucket)) {
    redirect("/public/types");
  }

  return <PublicTypesExplorer bucket={bucket as Bucket} />;
}
