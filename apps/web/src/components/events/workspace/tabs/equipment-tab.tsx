"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { Id } from "@/lib/convex-api";
import { notify } from "@/lib/notify";
import { EventPullList, mapPullListRow } from "@/components/events/event-pull-list";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";

export function EquipmentTab() {
  const { eventId, eventData, draft, baseline, seriesMeta } = useEventWorkspace();
  const initialItems = useMemo(
    () => (eventData?.pullListItems ?? []).map((row) => mapPullListRow(row)),
    [eventData?.pullListItems],
  );
  // Remount the list when the saved rows change so it re-seeds its own form.
  const syncKey = useMemo(
    () =>
      initialItems
        .map((row) => `${row.id ?? "new"}:${row.lineKind}:${row.typeId ?? row.packageId}:${row.quantityRequired}`)
        .join("|"),
    [initialItems],
  );

  if (!eventData || !baseline) {
    return <p className="text-sm text-muted-foreground">Loading pull list…</p>;
  }

  return (
    <Card>
      <CardContent>
        <EventPullList
          key={syncKey}
          eventId={eventId}
          eventType={draft.eventType}
          rentalFulfillmentMode={draft.rentalFulfillmentMode}
          invoiceId={draft.invoiceId ? (draft.invoiceId as Id<"invoices">) : undefined}
          seriesLinked={Boolean(seriesMeta && !seriesMeta.seriesDetached)}
          initialItems={initialItems}
          onSaved={notify.success}
          onError={notify.error}
        />
      </CardContent>
    </Card>
  );
}
