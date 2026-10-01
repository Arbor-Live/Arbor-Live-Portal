"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowSquareOutIcon, MicrophoneIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EventArtistBillSection } from "@/components/events/event-artist-bill-section";
import { EventBandRidersSection } from "@/components/events/event-band-riders-section";
import { Field } from "@/components/events/workspace/event-fields";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";

const OPEN_MIC_SIGNUP_CLOSES_AFTER_START_MS = 4 * 60 * 60 * 1000;

function OpenMicCard() {
  const { eventId, eventData, draft, updateDraft } = useEventWorkspace();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Keep the sign-up window check fresh while the page stays open.
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const event = eventData?.event;
  // Matches the backend (openMic.ts): the public form accepts sign-ups for a
  // scheduled/live add-on until 4 hours after the event's start.
  const signupOpen =
    event?.openMicEnabled === true &&
    (event.openMicStatus === "scheduled" || event.openMicStatus === "live") &&
    now <= event.startAt + OPEN_MIC_SIGNUP_CLOSES_AFTER_START_MS;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <MicrophoneIcon className="size-4 text-muted-foreground" />
            Open Mic
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            A first-come, first-served sign-up queue. Strangers sign up from the public Open Mic form and
            the crew calls them up via the runner.
          </p>
        </div>
        <Switch
          checked={draft.openMicEnabled}
          onCheckedChange={(openMicEnabled) => updateDraft({ openMicEnabled })}
          aria-label="Enable Open Mic"
        />
      </CardHeader>
      {draft.openMicEnabled ? (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link
              href={`/dashboard/events/open-mic/${eventId}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Open Mic runner
              <ArrowSquareOutIcon className="size-3.5" />
            </Link>
            {signupOpen ? (
              <Link
                href={`/open-mic?event=${eventId}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Sign-up form (open now)
                <ArrowSquareOutIcon className="size-3.5" />
              </Link>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Public sign-ups open until 4 hours after the event start.
          </p>
          <Field label="Open Mic notes" htmlFor="open-mic-notes">
            <Textarea
              id="open-mic-notes"
              className="min-h-20"
              value={draft.openMicNotes}
              onChange={(e) => updateDraft({ openMicNotes: e.target.value })}
              placeholder="Theme, special instructions, etc."
            />
          </Field>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function LineupTab() {
  const { eventId, canEdit, isAdmin } = useEventWorkspace();
  return (
    <div className="space-y-4">
      <EventArtistBillSection eventId={eventId} canEdit={canEdit} />
      <EventBandRidersSection eventId={eventId} />
      {isAdmin ? <OpenMicCard /> : null}
    </div>
  );
}
