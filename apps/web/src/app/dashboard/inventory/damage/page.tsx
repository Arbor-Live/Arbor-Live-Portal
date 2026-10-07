import { Suspense } from "react";
import { DamageQueueManager } from "@/components/inventory/damage-queue-manager";
import { Skeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Damage & repair",
};

export default function InventoryDamagePage() {
  // The queue reads `?report=` (the mention email's deep link) with
  // useSearchParams, which requires a Suspense boundary in a production build.
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <DamageQueueManager />
    </Suspense>
  );
}
