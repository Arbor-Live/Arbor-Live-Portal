"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { CheckIcon, WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { VenuePicker } from "@/components/venues/venue-picker";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import type { FunctionReturnType } from "convex/server";

export type TraineeReadiness = NonNullable<FunctionReturnType<typeof api.crewApplications.traineeEventReadiness>>;
type ContactStatus = NonNullable<TraineeReadiness["dayOfLead"]>;

const ROLE_LABELS = { eventManager: "Event manager", dayOfLead: "Event lead" } as const;

async function attempt(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    notify.success(success);
    return true;
  } catch (error) {
    notify.error(getConvexErrorMessage(error));
    return false;
  }
}

function isComplete(status: ContactStatus | undefined) {
  return Boolean(status && status.missing.length === 0);
}

/** The first reachable contact, lead first since they run the day. */
function reachableContact(readiness: TraineeReadiness) {
  if (isComplete(readiness.dayOfLead)) return { ...readiness.dayOfLead!, label: ROLE_LABELS.dayOfLead };
  if (isComplete(readiness.eventManager)) return { ...readiness.eventManager!, label: ROLE_LABELS.eventManager };
  return null;
}

function isUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Under the event picker: ready (venue · contact) or what's missing, with a way to fix it. */
export function TraineeReadinessNotice({
  readiness,
  onFix,
}: {
  readiness: TraineeReadiness;
  onFix: () => void;
}) {
  if (readiness.missing.length === 0) {
    const contact = reachableContact(readiness);
    return (
      <p
        className="flex items-start gap-2 border border-status-emerald-500/40 bg-status-emerald-500/10 px-3 py-2 text-xs text-status-emerald-700 dark:text-status-emerald-300"
        data-testid="trainee-readiness-ready"
      >
        <CheckIcon className="mt-0.5 size-3.5 shrink-0" weight="bold" aria-hidden />
        <span>
          Ready for trainees: {readiness.venue.venueName} · {readiness.venue.address}
          {contact ? ` · ${contact.name} is their contact` : ""}
        </span>
      </p>
    );
  }
  return (
    <div
      className="space-y-2 border border-status-amber-500/40 bg-status-amber-500/10 px-3 py-2 text-xs"
      data-testid="trainee-readiness-missing"
    >
      <p className="flex items-center gap-2 font-medium text-status-amber-700 dark:text-status-amber-300">
        <WarningIcon className="size-3.5 shrink-0" weight="fill" aria-hidden />
        This event isn&apos;t ready for a trainee yet
      </p>
      <ul className="list-disc space-y-0.5 pl-8 text-foreground/80">
        {readiness.missing.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Button type="button" size="sm" variant="outline" onClick={onFix}>
        Fix event details
      </Button>
    </div>
  );
}

function SectionStatus({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckIcon className="mt-0.5 size-4 shrink-0 text-status-emerald-700 dark:text-status-emerald-300" weight="bold" aria-hidden />
      ) : (
        <WarningIcon className="mt-0.5 size-4 shrink-0 text-status-amber-700 dark:text-status-amber-300" weight="fill" aria-hidden />
      )}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function VenueLocationForm({
  venueId,
  venueName,
  initialMapsUrl,
}: {
  venueId: Id<"venues">;
  venueName: string;
  initialMapsUrl?: string;
}) {
  const setLocation = useMutation(api.venues.setLocation);
  const [address, setAddress] = useState("");
  const [mapsUrl, setMapsUrl] = useState(initialMapsUrl ?? "");
  const [saving, setSaving] = useState(false);
  const mapsInvalid = Boolean(mapsUrl.trim()) && !isUrl(mapsUrl.trim());

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        // The dialog portals out of the trainee form, but React still bubbles submit to it.
        event.stopPropagation();
        setSaving(true);
        void attempt(
          () => setLocation({ id: venueId, address, googleMapsUrl: mapsUrl || undefined }),
          `Saved the address for ${venueName}`,
        ).finally(() => setSaving(false));
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="trainee-venue-address">Address</Label>
        <Input
          id="trainee-venue-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="459 Lagunita Dr, Stanford, CA 94305"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="trainee-venue-maps">Google Maps link</Label>
        <Input
          id="trainee-venue-maps"
          value={mapsUrl}
          onChange={(event) => setMapsUrl(event.target.value)}
          placeholder="https://maps.app.goo.gl/…"
          inputMode="url"
          aria-invalid={mapsInvalid || undefined}
        />
        {mapsInvalid ? <p className="text-xs text-destructive">Enter a full link, starting with https://</p> : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Saves to {venueName} for every event there.</p>
        <Button type="submit" size="sm" disabled={saving || !address.trim() || mapsInvalid}>
          Save address
        </Button>
      </div>
    </form>
  );
}

function ContactPhoneForm({ status, label }: { status: ContactStatus; label: string }) {
  const updateUser = useMutation(api.users.updateUserAdmin);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const inputId = `trainee-contact-phone-${status.userId}`;
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        // The dialog portals out of the trainee form, but React still bubbles submit to it.
        event.stopPropagation();
        setSaving(true);
        void attempt(
          () => updateUser({ userId: status.userId, phone: phone.trim() }),
          `Saved ${status.name ?? "their"} phone number`,
        ).finally(() => setSaving(false));
      }}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <Label htmlFor={inputId}>
          Phone for {status.name ?? label}
        </Label>
        <Input
          id={inputId}
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="650 555 0199"
          autoComplete="off"
        />
      </div>
      <Button type="submit" size="sm" disabled={saving || !phone.trim()}>
        Save phone
      </Button>
    </form>
  );
}

/**
 * Fixes what blocks a trainee intro, saving each change to the event (or the
 * venue, or the person) as it's made. The readiness query is live, so each
 * section flips to done on its own; the footer assigns once nothing's missing.
 */
export function TraineeReadinessDialog({
  open,
  onOpenChange,
  eventId,
  readiness,
  staffOptions,
  onAssign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: Id<"events">;
  readiness: TraineeReadiness;
  staffOptions: UserSelectOption[];
  onAssign: () => void;
}) {
  const updateEvent = useMutation(api.events.update);
  const { venue } = readiness;
  const venueOk = Boolean(venue.venueName && venue.address);
  const contact = reachableContact(readiness);
  const incomplete = (["dayOfLead", "eventManager"] as const)
    .map((role) => ({ role, status: readiness[role] }))
    .filter((entry): entry is { role: "dayOfLead" | "eventManager"; status: ContactStatus } =>
      Boolean(entry.status && entry.status.missing.length > 0),
    );
  const ready = readiness.missing.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="trainee-readiness-dialog">
        <DialogHeader>
          <DialogTitle>Get {readiness.eventTitle} ready for trainees</DialogTitle>
          <DialogDescription>
            The intro email tells them where to go and who to call. Each change saves to the event right away.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3 border-t pt-4" data-testid="trainee-readiness-venue">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Venue</h3>
          {venueOk ? (
            <SectionStatus ok>
              {venue.venueName} · {venue.address}
            </SectionStatus>
          ) : venue.venueId && venue.venueName ? (
            <>
              <SectionStatus ok={false}>{venue.venueName} has no address yet.</SectionStatus>
              <VenueLocationForm
                key={venue.venueId}
                venueId={venue.venueId}
                venueName={venue.venueName}
                initialMapsUrl={venue.googleMapsUrl}
              />
            </>
          ) : (
            <>
              <SectionStatus ok={false}>
                {venue.venueName
                  ? `“${venue.venueName}” is typed in, not a saved venue, so there's no address. Pick or create the venue.`
                  : "No venue yet. Pick one, or create it with its address."}
              </SectionStatus>
              <div className="space-y-1">
                <Label htmlFor="trainee-venue-picker">Venue</Label>
                <VenuePicker
                  id="trainee-venue-picker"
                  value=""
                  allowCreate
                  onChange={(venueId) => {
                    if (!venueId) return;
                    void attempt(
                      () => updateEvent({ id: eventId, venueId: venueId as Id<"venues"> }),
                      "Venue saved to the event",
                    );
                  }}
                />
              </div>
            </>
          )}
        </section>

        <section className="space-y-3 border-t pt-4" data-testid="trainee-readiness-contact">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Trainee contact</h3>
          {contact ? (
            <SectionStatus ok>
              {contact.name} ({contact.label.toLowerCase()}) is their contact.
            </SectionStatus>
          ) : (
            <>
              <SectionStatus ok={false}>
                {incomplete.length
                  ? "Nobody on the event has a full name, email and phone yet."
                  : "No event lead or manager yet. Pick an event lead to be their contact."}
              </SectionStatus>
              {incomplete.map(({ role, status }) =>
                status.missing.length === 1 && status.missing[0] === "phone" ? (
                  <ContactPhoneForm key={`${role}-${status.userId}`} status={status} label={ROLE_LABELS[role]} />
                ) : (
                  <p key={`${role}-${status.userId}`} className="text-xs text-muted-foreground">
                    {ROLE_LABELS[role]}
                    {status.name ? ` ${status.name}` : ""}:{" "}
                    {status.missing.includes("user")
                      ? "the assigned account no longer exists."
                      : `no ${status.missing.join(" or ")} on their profile. Fix it under Users, or pick someone else.`}
                  </p>
                ),
              )}
            </>
          )}
          {!contact || readiness.dayOfLead?.userId !== contact.userId ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Event lead</p>
              <UserSelect
                value={readiness.dayOfLead?.userId ?? ""}
                onChange={(userId) => {
                  if (!userId) return;
                  void attempt(() => updateEvent({ id: eventId, dayOfLeadUserId: userId }), "Event lead saved");
                }}
                options={staffOptions}
                emptyLabel="Pick an event lead"
                placeholder="Search staff..."
              />
            </div>
          ) : null}
        </section>

        <DialogFooter className="border-t pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {ready ? "Close" : "Not now"}
          </Button>
          <Button type="button" disabled={!ready} onClick={onAssign}>
            {ready ? "Assign as trainee" : `${readiness.missing.length} left to fix`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
