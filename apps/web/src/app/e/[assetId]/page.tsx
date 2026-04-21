import { PublicEquipmentClient } from "@/components/public/public-equipment-client";

export default async function PublicEquipmentPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return <PublicEquipmentClient assetId={assetId} />;
}
