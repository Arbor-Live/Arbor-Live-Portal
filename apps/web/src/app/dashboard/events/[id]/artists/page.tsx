import type { Metadata } from "next";
import { eventTabMetadata } from "@/lib/event-tab-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return eventTabMetadata(params, "Lineup");
}

export default function EditEventArtistsPage() {
  return null;
}
