"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="grid gap-1 border-b py-3 sm:grid-cols-[180px_1fr]">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export function EventRequestDetailClient({ requestId }: { requestId: Id<"eventRequests"> }) {
  const router = useRouter();
  const request = useQuery(api.eventRequests.get, { id: requestId });
  const updateStatus = useMutation(api.eventRequests.updateStatus);
  const convertToEvent = useMutation(api.eventRequests.convertToEvent);
  const [staffNotes, setStaffNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (request === undefined) {
    return <p className="text-sm text-muted-foreground">Loading request...</p>;
  }
  if (request === null) {
    return <p className="text-sm text-destructive">Request not found.</p>;
  }

  async function handleStatus(status: "in_review" | "declined") {
    setSaving(true);
    setError(null);
    try {
      await updateStatus({
        id: requestId,
        status,
        staffNotes: staffNotes.trim() || undefined,
      });
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to update request.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConvert() {
    setSaving(true);
    setError(null);
    try {
      const result = await convertToEvent({ id: requestId });
      router.push(`/dashboard/events/${result.eventId}`);
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : "Failed to convert request.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/events/requests">Back to requests</Link>
        </Button>
        {request.publicToken ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/public/request/track/${request.publicToken}`} target="_blank">
              Public tracker
            </Link>
          </Button>
        ) : null}
        {request.convertedEventId ? (
          <Button asChild size="sm">
            <Link href={`/dashboard/events/${request.convertedEventId}`}>Open converted event</Link>
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-md border p-4">
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-muted px-2 py-0.5">{request.requestNumber ?? request._id}</span>
          <span className="rounded bg-muted px-2 py-0.5">{request.status}</span>
          <span className="rounded bg-muted px-2 py-0.5">
            Submitted {new Date(request.submittedAt).toLocaleString()}
          </span>
        </div>

        <DetailRow label="Name" value={`${request.firstName} ${request.lastName}`} />
        <DetailRow label="Email" value={request.email} />
        <DetailRow label="Phone" value={request.phone} />
        <DetailRow label="Organization" value={request.organization} />
        <DetailRow label="Sponsor type" value={request.sponsorType} />
        <DetailRow label="Venue" value={request.venueName} />
        <DetailRow label="Venue address" value={request.venueAddress} />
        <DetailRow label="Event date" value={request.eventDateText} />
        <DetailRow label="Start time" value={request.eventStartTimeText} />
        <DetailRow label="End time" value={request.eventEndTimeText} />
        <DetailRow label="Earliest setup" value={request.earliestSetupText} />
        <DetailRow
          label="Flexible setup"
          value={request.flexibleSetupTime ? "Yes" : request.flexibleSetupTime === false ? "No" : undefined}
        />
        <DetailRow label="Event category" value={request.eventCategory} />
        <DetailRow label="Services" value={request.servicesNeeded.join("\n")} />
        <DetailRow label="Production tier" value={request.productionTier} />
        <DetailRow label="Description" value={request.eventDescription} />
        <DetailRow label="Expected turnout" value={request.expectedTurnout} />
        <DetailRow label="Existing equipment" value={request.existingEquipment} />
        <DetailRow label="Lighting" value={request.lightingPreference} />
        <DetailRow label="Additional notes" value={request.additionalNotes} />
        <DetailRow label="Staff notes" value={request.staffNotes} />
      </div>

      {request.status !== "converted" && request.status !== "declined" ? (
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm font-medium">Staff actions</p>
          <textarea
            value={staffNotes}
            onChange={(event) => setStaffNotes(event.target.value)}
            placeholder="Internal notes (optional)"
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving || request.status === "in_review"}
              onClick={() => void handleStatus("in_review")}
            >
              Mark in review
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => void handleStatus("declined")}>
              Decline
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleConvert()}>
              Convert to event
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
