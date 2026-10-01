import { PublicEquipmentClient } from "@/components/public/public-equipment-client";

export const metadata = {
  title: "Lost & Found",
  description: "Return found Arbor Live equipment using the asset ID on the label.",
};

export default async function PublicEquipmentPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return <PublicEquipmentClient assetId={assetId} />;
}
