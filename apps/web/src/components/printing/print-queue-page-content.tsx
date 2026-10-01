"use client";

import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PrintQueueClient } from "@/components/printing/print-queue-client";

export function PrintQueuePageContent() {
  return (
    <ArborOnlyGuard>
      <PrintQueueClient />
    </ArborOnlyGuard>
  );
}
