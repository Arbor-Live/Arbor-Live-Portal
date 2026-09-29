"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { MoonStarsIcon, ClipboardTextIcon } from "@phosphor-icons/react";
import { DEFAULT_PATCH_PLAN } from "@arbor/show-file";
import { api, type Id } from "@/lib/convex-api";
import { formatDate } from "@/lib/format";
import { nightRiderPlan } from "@/lib/night-rider-plan";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { StagePlotCanvas } from "@/components/riders/stage-plot-canvas";
import { RiderPdfDownloadButton } from "@/components/riders/rider-pdf-download-button";
import { EventShowFilePanel } from "@/components/events/event-show-file-panel";
import { EventNightRiderDownloadButton } from "@/components/events/event-night-rider-download-button";
import { StageBoxPatchDiffViews } from "@/components/events/stage-box-patch-diff-views";
import { SnakePlanControls } from "@/components/events/snake-plan-controls";
import { NightRiderChangeoverList } from "@/components/events/night-rider-changeover-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EventBandRidersSection({ eventId }: { eventId: Id<"events"> }) {
  return (
    <ArborOnlyGuard>
      <EventBandRidersPanel eventId={eventId} />
    </ArborOnlyGuard>
  );
}

function EventBandRidersPanel({ eventId }: { eventId: Id<"events"> }) {
  const rows = useQuery(api.bandRiders.listForEvent, { eventId });
  const savedPlan = useQuery(api.eventPatchPlan.get, { eventId });
  const plan = savedPlan ?? DEFAULT_PATCH_PLAN;

  if (rows === undefined) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">Loading riders…</CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  const { patchPlan, changeovers, fitsOneBox } = nightRiderPlan(rows, plan);

  return (
    <div className="space-y-4" data-testid="event-band-riders">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <MoonStarsIcon className="size-4 text-muted-foreground" />
            Night rider
          </CardTitle>
          <EventNightRiderDownloadButton eventId={eventId} disabled={!patchPlan} />
        </CardHeader>
        <CardContent className="space-y-4">
          <SnakePlanControls eventId={eventId} plan={plan} fitsOneBox={fitsOneBox} />
          {patchPlan ? <StageBoxPatchDiffViews plan={patchPlan} /> : null}
          {patchPlan ? <EventShowFilePanel eventId={eventId} /> : null}
          <NightRiderChangeoverList changeovers={changeovers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardTextIcon className="size-4 text-muted-foreground" />
            Artist riders
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {rows.map((row) => (
            <div
              key={row.organizationId}
              className="space-y-3 border-b pb-6 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{row.bandName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{row.role}</p>
                </div>
                {row.rider ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" asChild>
                      <Link href={`/dashboard/artists/riders/${row.rider._id}`}>
                        Open rider
                      </Link>
                    </Button>
                    <RiderPdfDownloadButton riderId={row.rider._id} />
                  </div>
                ) : null}
              </div>

              {!row.rider ? (
                <p className="text-sm text-muted-foreground">
                  No default or published rider yet for this artist.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {row.rider.name}
                    {" · "}
                    {row.rider.status === "published" ? "Published" : "Draft"}
                    {" · "}
                    Updated {formatDate(row.rider.updatedAt)}
                  </p>
                  <div className="overflow-hidden rounded-md border bg-muted/20">
                    <StagePlotCanvas
                      content={{
                        stage: row.rider.stage,
                        items: row.rider.items,
                        inputs: row.rider.inputs,
                        monitorMixes: row.rider.monitorMixes,
                        backline: row.rider.backline,
                        performerCount: row.rider.performerCount,
                        setLengthMinutes: row.rider.setLengthMinutes,
                        powerNotes: row.rider.powerNotes,
                        generalNotes: row.rider.generalNotes,
                        hospitalityNotes: row.rider.hospitalityNotes,
                        contactName: row.rider.contactName,
                        contactEmail: row.rider.contactEmail,
                        contactPhone: row.rider.contactPhone,
                      }}
                      readOnly
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
