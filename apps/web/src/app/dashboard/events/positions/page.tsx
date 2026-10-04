import { redirect } from "next/navigation";

/** Open Positions moved under Artists; keep old links (and their `?outreach=`) working. */
export default async function OpenPositionsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, item);
    }
  }
  const query = params.toString();
  redirect(`/dashboard/artists/positions${query ? `?${query}` : ""}`);
}
