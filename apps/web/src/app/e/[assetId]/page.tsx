import { PublicEquipmentClient } from "@/components/public/public-equipment-client";

export const metadata = {
  title: "Equipment record | Arbor Live",
  description: "Look up Arbor Live inventory by asset ID for lost & found and product details.",
};

export default async function PublicEquipmentPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return <PublicEquipmentClient assetId={assetId} />;
}
