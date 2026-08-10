import { Suspense } from "react";
import { DamageQueueManager } from "@/components/inventory/damage-queue-manager";

export default function InventoryDamagePage() {
  // The queue reads `?report=` (the mention email's deep link) with
  // useSearchParams, which requires a Suspense boundary in a production build.
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading damage queue…</p>}>
      <DamageQueueManager />
    </Suspense>
  );
}
