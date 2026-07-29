"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { CopyIcon, PlusIcon, StarIcon, TrashIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { formatDate } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RiderPdfDownloadButton } from "@/components/riders/rider-pdf-download-button";
import { RiderTemplatePicker } from "@/components/riders/rider-template-picker";
import { useAdminBandSelection } from "@/components/bands/admin-band-selection";

export function RiderListClient() {
  const { organizationId, isAdminManaging } = useAdminBandSelection();
  const riders = useQuery(
    api.bandRiders.listForActiveBand,
    isAdminManaging
      ? organizationId
        ? { organizationId }
        : "skip"
      : {},
  );
  const setDefault = useMutation(api.bandRiders.setDefault);
  const duplicate = useMutation(api.bandRiders.duplicate);
  const remove = useMutation(api.bandRiders.remove);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<Id<"bandRiders"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    riderId: Id<"bandRiders">,
    action: () => Promise<unknown>,
  ) {
    setBusyId(riderId);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (isAdminManaging && !organizationId) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Select a band above to manage its riders.
        </CardContent>
      </Card>
    );
  }

  if (riders === undefined) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">Loading riders…</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {riders.length === 0
            ? "No riders yet — create one from a starter layout."
            : `${riders.length} rider${riders.length === 1 ? "" : "s"}`}
        </p>
        <Button type="button" onClick={() => setPickerOpen(true)}>
          <PlusIcon className="size-4" />
          New rider
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {riders.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start with a stage plot</CardTitle>
            <CardDescription>
              Pick a full band, trio, singer-songwriter, or DJ layout — then drag
              symbols to match your set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={() => setPickerOpen(true)}>
              Create your first rider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {riders.map((rider) => {
            const busy = busyId === rider._id;
            return (
              <li key={rider._id}>
                <Card className="h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="truncate text-base">
                          <Link
                            href={`/dashboard/bands-and-performers/riders/${rider._id}`}
                            className="hover:underline"
                          >
                            {rider.name}
                          </Link>
                        </CardTitle>
                        <CardDescription>
                          {rider.status === "published" ? "Published" : "Draft"}
                          {" · "}
                          {rider.channelCount} ch · {rider.mixCount} mixes ·{" "}
                          {rider.itemCount} on plot
                        </CardDescription>
                      </div>
                      {rider.isDefault ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          <StarIcon className="size-3" weight="fill" />
                          Default
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Updated {formatDate(rider.updatedAt)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" asChild>
                        <Link href={`/dashboard/bands-and-performers/riders/${rider._id}`}>
                          Edit
                        </Link>
                      </Button>
                      <RiderPdfDownloadButton riderId={rider._id} />
                      {!rider.isDefault ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(rider._id, () => setDefault({ riderId: rider._id }))
                          }
                        >
                          <StarIcon className="size-3.5" />
                          Set default
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(rider._id, () => duplicate({ riderId: rider._id }))
                        }
                      >
                        <CopyIcon className="size-3.5" />
                        Duplicate
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Delete “${rider.name}”? This cannot be undone.`,
                            )
                          ) {
                            return;
                          }
                          void run(rider._id, () => remove({ riderId: rider._id }));
                        }}
                      >
                        <TrashIcon className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <RiderTemplatePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        organizationId={organizationId ?? undefined}
      />
    </div>
  );
}
