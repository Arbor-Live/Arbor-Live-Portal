"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate } from "@/lib/format";
import { CREW_OT_MULTIPLIER } from "@/lib/invoice-crew-from-event";
import { notify } from "@/lib/notify";
import type { InvoiceDraft } from "./use-invoice-draft";

/**
 * The linked days' OT flags, next to the crew rate mode. Each is the event's
 * own `otPremium` (the same one as the event Billing tab), so the quote, the
 * event's crew cost and the crew timecards all agree. Recurring series bill
 * from the series template and have no single day to mark.
 */
export function InvoiceOvertimeControl({ draft }: { draft: InvoiceDraft }) {
  const updateEvent = useMutation(api.events.update);
  const [savingId, setSavingId] = useState<Id<"events"> | null>(null);
  const { linkedEvent, linkedSeries, linkedDayEvents } = draft;
  if (!linkedEvent || linkedSeries) return null;
  const days = linkedDayEvents.length > 0 ? linkedDayEvents : [{ ...linkedEvent, otPremium: false }];
  const multiDay = days.length > 1;

  async function setOvertime(eventId: Id<"events">, otPremium: boolean, label: string) {
    setSavingId(eventId);
    try {
      await updateEvent({ id: eventId, otPremium });
      notify.success(otPremium ? `Marked ${label} OT.` : `${label[0]!.toUpperCase()}${label.slice(1)} is no longer OT.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSavingId(null);
    }
  }

  if (!multiDay) {
    const day = days[0]!;
    return (
      <div className="space-y-1.5" data-testid="invoice-crew-overtime">
        <span className="text-xs font-medium">Overtime</span>
        <div className="flex items-center gap-2">
          <Switch
            id="invoice-crew-overtime"
            checked={day.otPremium === true}
            disabled={savingId !== null}
            onCheckedChange={(next) => void setOvertime(day._id, next, "the event")}
          />
          <Label htmlFor="invoice-crew-overtime" className="text-sm font-normal">
            Event is OT
            <span className="text-xs text-muted-foreground"> · every crew line at {CREW_OT_MULTIPLIER}×</span>
          </Label>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="invoice-crew-overtime">
      <span className="text-xs font-medium">
        OT days <span className="font-normal text-muted-foreground">· crew bills at {CREW_OT_MULTIPLIER}×</span>
      </span>
      <div className="flex flex-col gap-1.5">
        {days.map((day, index) => {
          const id = `invoice-crew-overtime-${day._id}`;
          return (
            <div key={day._id} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={day.otPremium === true}
                disabled={savingId !== null}
                onCheckedChange={(next) => void setOvertime(day._id, next === true, `day ${index + 1}`)}
              />
              <Label htmlFor={id} className="text-sm font-normal">
                Day {index + 1}
                <span className="text-xs text-muted-foreground"> · {formatDate(day.startAt)}</span>
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
