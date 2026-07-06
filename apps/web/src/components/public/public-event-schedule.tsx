"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeRange } from "@/lib/format";

export function PublicEventSchedule({
  blocks,
}: {
  blocks: Array<{
    _id: string;
    blockType: string;
    label: string;
    startsAt: number;
    endsAt: number;
    notes?: string;
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {blocks.length ? (
          blocks.map((block) => (
            <div key={block._id} className="rounded-md border px-3 py-2 text-sm">
              <p className="font-medium">
                {block.label} <span className="text-xs text-muted-foreground">({block.blockType})</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTimeRange(block.startsAt, block.endsAt)}
              </p>
              {block.notes ? <p className="mt-1 text-xs text-muted-foreground">{block.notes}</p> : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No schedule blocks added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
