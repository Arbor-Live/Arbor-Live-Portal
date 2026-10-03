import type { Metadata } from "next";
import { eventGroupTabMetadata } from "@/lib/event-group-tab-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}): Promise<Metadata> {
  return eventGroupTabMetadata(params, "Run of Show template");
}

export default function EventGroupRunOfShowPage() {
  return null;
}
