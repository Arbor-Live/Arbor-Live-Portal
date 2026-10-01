import { PrintQueuePageContent } from "@/components/printing/print-queue-page-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Print queue",
};

export default function PrintQueuePage() {
  return <PrintQueuePageContent />;
}
