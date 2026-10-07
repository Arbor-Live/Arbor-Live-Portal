"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { GridFourIcon, PlusIcon, StarIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { downloadBytes } from "@/lib/download-bytes";
import { formatDate, plural } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ListRow } from "@/components/list-row";
import { EmptyState, ListSummary, RowCell, RowList, RowMenu, RowText } from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { RiderTemplatePicker } from "@/components/riders/rider-template-picker";
import { useAdminBandSelection } from "@/components/bands/admin-band-selection";

type RiderSummary = NonNullable<
  ReturnType<typeof useQuery<typeof api.bandRiders.listForActiveBand>>
>[number];


function riderDetail(rider: RiderSummary) {
  return [
    plural(rider.channelCount, "input"),
    plural(rider.mixCount, "monitor mix", "monitor mixes"),
    `${rider.itemCount} on the plot`,
  ].join(" · ");
}

export function RiderListClient() {
  const { confirm } = useAppDialog();
  const { organizationId, isAdminManaging } = useAdminBandSelection();
  const riders = useQuery(
    api.bandRiders.listForActiveBand,
    isAdminManaging ? (organizationId ? { organizationId } : "skip") : {},
  );
  const setDefault = useMutation(api.bandRiders.setDefault);
  const duplicate = useMutation(api.bandRiders.duplicate);
  const remove = useMutation(api.bandRiders.remove);
  const downloadPdf = useAction(api.bandRiderPdfDownload.downloadByRiderId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<Id<"bandRiders"> | null>(null);

  async function run(riderId: Id<"bandRiders">, action: () => Promise<unknown>, success: string) {
    setBusyId(riderId);
    try {
      await action();
      notify.success(success);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function onDownload(rider: RiderSummary) {
    try {
      const result = await downloadPdf({ riderId: rider._id });
      downloadBytes(result.bytes, result.fileName);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function onDelete(rider: RiderSummary) {
    const confirmed = await confirm({
      title: `Delete “${rider.name}”?`,
      description: rider.isDefault
        ? "This is your default rider, so your most recently updated rider becomes the default. This can't be undone."
        : "Shows that picked it go back to your default rider. This can't be undone.",
      destructive: true,
      confirmLabel: "Delete rider",
    });
    if (!confirmed) return;
    await run(rider._id, () => remove({ riderId: rider._id }), `Deleted ${rider.name}.`);
  }

  if (isAdminManaging && !organizationId) {
    return <EmptyState>Pick an artist in the header to manage their riders.</EmptyState>;
  }

  if (riders === undefined) {
    return <p className="text-sm text-muted-foreground">Loading riders…</p>;
  }

  const defaultRider = riders.find((rider) => rider.isDefault);

  return (
    <div className="space-y-4" data-testid="rider-list">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ListSummary
          testId="rider-list-summary"
          order="Default first, then the most recently updated. Shows use your default unless you pick another for a show."
        >
          {riders.length === 0
            ? "No riders yet"
            : [
                plural(riders.length, "rider"),
                defaultRider ? `default: ${defaultRider.name}` : "no default yet",
              ].join(" · ")}
        </ListSummary>
        <Button type="button" size="sm" onClick={() => setPickerOpen(true)}>
          <PlusIcon weight="bold" />
          New rider
        </Button>
      </div>
      {riders.length === 0 ? (
        <EmptyState
          action={
            <Button type="button" size="sm" onClick={() => setPickerOpen(true)}>
              Create your first rider
            </Button>
          }
        >
          No riders yet. Start from a full band, trio, singer-songwriter or DJ layout, then drag
          symbols to match your set. Crew prep your stage, inputs and monitors from it.
        </EmptyState>
      ) : (
        <RowList joined testId="rider-rows">
          {riders.map((rider) => {
            const busy = busyId === rider._id;
            return (
              <ListRow
                key={rider._id}
                data-testid="rider-row"
                href={`/dashboard/artists/riders/${rider._id}`}
                actions={
                  <RowMenu label={`More for ${rider.name}`}>
                    <DropdownMenuItem onSelect={() => void onDownload(rider)}>
                      Download PDF
                    </DropdownMenuItem>
                    {!rider.isDefault ? (
                      <DropdownMenuItem
                        disabled={busy}
                        onSelect={() =>
                          void run(
                            rider._id,
                            () => setDefault({ riderId: rider._id }),
                            `${rider.name} is now your default rider.`,
                          )
                        }
                      >
                        Set as default
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      disabled={busy}
                      onSelect={() =>
                        void run(
                          rider._id,
                          () => duplicate({ riderId: rider._id }),
                          `Duplicated ${rider.name}.`,
                        )
                      }
                    >
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={busy}
                      onSelect={() => void onDelete(rider)}
                    >
                      Delete rider
                    </DropdownMenuItem>
                  </RowMenu>
                }
              >
                <span className="flex size-8 shrink-0 items-center justify-center border bg-muted/30 text-muted-foreground">
                  <GridFourIcon className="size-4" aria-hidden />
                </span>
                <RowText
                  eyebrow={rider.isDefault ? "Default rider" : "Rider"}
                  title={rider.name}
                  detail={riderDetail(rider)}
                />
                {rider.isDefault ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-status-amber-500/15 px-2 py-0.5 text-xs text-status-amber-700 dark:text-status-amber-200">
                    <StarIcon className="size-3" weight="fill" aria-hidden />
                    Default
                  </span>
                ) : null}
                <RowCell className="w-40 whitespace-nowrap" hideBelow="md" muted>
                  Updated {formatDate(rider.updatedAt)}
                </RowCell>
                <span className="flex w-24 shrink-0 justify-end">
                  <StatusPill tone={rider.status === "published" ? "emerald" : "neutral"}>
                    {rider.status === "published" ? "Published" : "Draft"}
                  </StatusPill>
                </span>
              </ListRow>
            );
          })}
        </RowList>
      )}

      <RiderTemplatePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        organizationId={organizationId ?? undefined}
      />
    </div>
  );
}
