import { LostFoundSettingsManager } from "@/components/inventory/lost-found-settings-manager";
import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lost & found",
};

export default function InventoryLostFoundPage() {
  return (
    <div className="space-y-4 pb-24" data-testid="lost-found-page">
      <PageHeader
        title="Lost & found"
        description="What someone sees after scanning the tag on gear they've found: how to get it back to us. One set of instructions covers every tagged item."
      />
      <LostFoundSettingsManager />
    </div>
  );
}
