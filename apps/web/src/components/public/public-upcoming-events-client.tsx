"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { PublicEventsGrid } from "@/components/public/public-events-grid";

export function PublicUpcomingEventsClient() {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.publicEvents.listUpcoming, { now });
  return <PublicEventsGrid events={events} />;
}
