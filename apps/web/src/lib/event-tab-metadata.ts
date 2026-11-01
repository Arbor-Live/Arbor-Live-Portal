import type { Metadata } from "next";
import { api, type Id } from "@/lib/convex-api";
import { fetchAuthQuery } from "@/lib/auth-server";

/**
 * Browser-tab title for an event workspace tab: "<event title> · <tab>".
 * Shared by the six `events/[id]` tab pages so the layout's default title is
 * only used if a tab forgets to define its own. A failed lookup (signed out,
 * wrong organization, bad id) falls back to the tab label: a throw here
 * replaces the whole page with the error screen.
 */
export async function eventTabMetadata(
  params: Promise<{ id: string }>,
  tabLabel: string,
): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchAuthQuery(api.events.get, {
    id: id as Id<"events">,
    detail: "schedule",
  }).catch(() => null);
  const title = data?.event.title?.trim();
  return { title: title ? `${title} · ${tabLabel}` : tabLabel };
}
