import type { Metadata } from "next";
import { api, type Id } from "@/lib/convex-api";
import { fetchAuthQuery } from "@/lib/auth-server";

/**
 * Browser-tab title for an event group page tab: "<group title> · <tab>".
 * Shared by the group tab pages (like `eventTabMetadata` for event tabs); the
 * layout must not export metadata, which would clear the title template.
 */
export async function eventGroupTabMetadata(
  params: Promise<{ seriesId: string }>,
  tabLabel: string,
): Promise<Metadata> {
  const { seriesId } = await params;
  const data = await fetchAuthQuery(api.eventSeries.get, { id: seriesId as Id<"eventSeries"> });
  const title = data?.series.title?.trim();
  return { title: title ? `${title} · ${tabLabel}` : tabLabel };
}
