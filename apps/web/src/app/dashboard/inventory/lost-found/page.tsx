import { LostFoundSettingsManager } from "@/components/inventory/lost-found-settings-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lost & found",
};

export default function InventoryLostFoundPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Lost &amp; Found</h1>
      <LostFoundSettingsManager />
    </div>
  );
}
