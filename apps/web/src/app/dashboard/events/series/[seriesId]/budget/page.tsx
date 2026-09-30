import type { Metadata } from "next";
import { eventGroupTabMetadata } from "@/lib/event-group-tab-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}): Promise<Metadata> {
  return eventGroupTabMetadata(params, "Budget");
}

export default function EventGroupBudgetPage() {
  return null;
}
