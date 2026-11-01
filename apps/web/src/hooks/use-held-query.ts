"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

/**
 * `useQuery` for args that move with the clock. New args make `useQuery` return
 * undefined until the server answers, so the last answer is held to keep the
 * screen from blinking back to its loading state.
 */
export function useHeldQuery<Query extends FunctionReference<"query">>(query: Query, args: FunctionArgs<Query>) {
  const latest = useQuery(query, args) as FunctionReturnType<Query> | undefined;
  const [held, setHeld] = useState(latest);
  if (latest !== undefined && latest !== held) setHeld(latest);
  return latest ?? held;
}
