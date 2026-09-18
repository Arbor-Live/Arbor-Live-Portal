"use client";

import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PrintQueueClient } from "@/components/printing/print-queue-client";

export default function PrintQueuePage() {
  return (
    <ArborOnlyGuard>
      <PrintQueueClient />
    </ArborOnlyGuard>
  );
}
