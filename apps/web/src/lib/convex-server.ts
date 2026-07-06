import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { getConvexCloudUrl } from "@/lib/convex-env";

export async function fetchPublicQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>,
): Promise<FunctionReturnType<Query>> {
  const client = new ConvexHttpClient(getConvexCloudUrl());
  return client.query(query, args);
}

/** Best-effort public query for static generation — returns fallback instead of throwing. */
export async function fetchPublicQuerySafe<
  Query extends FunctionReference<"query">,
  Fallback extends FunctionReturnType<Query>,
>(query: Query, args: FunctionArgs<Query>, fallback: Fallback): Promise<FunctionReturnType<Query>> {
  try {
    return await fetchPublicQuery(query, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[convex] Public query failed: ${message}`);
    return fallback;
  }
}

/** @deprecated Use fetchPublicQuerySafe */
export const fetchPublicQueryForStaticParams = fetchPublicQuerySafe;
