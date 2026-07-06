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
