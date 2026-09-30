"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { PrinterIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { MAX_POSTER_COPIES, isPrintableAssetReference } from "@/lib/r2-assets";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Sends copies of an event's saved poster to the warehouse printer. Prints the
 * saved image, so unsaved edits in the form next to it are not included.
 */
export function PrintPosterButton({
  designId,
  savedImageUrl,
}: {
  designId: Id<"eventMarketingDesigns"> | null | undefined;
  savedImageUrl: string | null | undefined;
}) {
  const printPoster = useMutation(api.printJobs.printPoster);
  const { alert } = useAppDialog();
  const [open, setOpen] = useState(false);
  const [copies, setCopies] = useState(1);
  const [pending, setPending] = useState(false);

  const hasPoster = Boolean(designId && savedImageUrl?.trim());
  const printable = hasPoster && isPrintableAssetReference(savedImageUrl ?? undefined);
  const disabledReason = !hasPoster
    ? "Save a poster image to print it."
    : !printable
      ? "Only PNG, JPEG, and PDF posters can be printed."
      : null;

  async function submit() {
    if (!designId || pending) return;
    setPending(true);
    try {
      const jobId = await printPoster({ designId, copies });
      if (jobId) {
        notify.success(`${copies} ${copies === 1 ? "copy" : "copies"} of the poster queued for printing.`);
        setOpen(false);
      } else {
        await alert("No enabled printer is configured yet, so the poster wasn’t queued.");
      }
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn’t queue the poster for printing."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(disabledReason)}
          title={disabledReason ?? undefined}
        >
          <PrinterIcon />
          Print poster
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60">
        <div className="space-y-1.5">
          <Label htmlFor="print-poster-copies">Copies</Label>
          <NumberInput
            id="print-poster-copies"
            value={copies}
            onValueChange={(value) => setCopies(Math.round(value))}
            min={1}
            max={MAX_POSTER_COPIES}
            fallback={1}
            step={1}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
          />
          <p className="text-muted-foreground">Up to {MAX_POSTER_COPIES} per print.</p>
        </div>
        <Button type="button" size="sm" disabled={pending} onClick={() => void submit()}>
          {pending ? "Queuing…" : "Print"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
