"use client";

import { MicrophoneStageIcon, NotePencilIcon, UserCircleIcon } from "@phosphor-icons/react";
import type { RiderContent } from "@arbor/rider-document";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, type RiderPanelProps } from "@/components/riders/rider-editor-parts";

/** An optional whole number: empty clears it, anything else clamps into range. */
function parseCount(value: string, max: number): number | undefined | null {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(max, Math.round(parsed)));
}

export function RiderDetailsPanel({ content, readOnly, onChange }: RiderPanelProps) {
  function set(patch: Partial<RiderContent>) {
    onChange((current) => ({ ...current, ...patch }), `details:${Object.keys(patch).join()}`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="rider-details-panel">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MicrophoneStageIcon className="size-4 text-muted-foreground" aria-hidden />
            The show
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Field id="rider-performer-count" label="Performers">
            <Input
              id="rider-performer-count"
              type="number"
              inputMode="numeric"
              min={0}
              max={40}
              disabled={readOnly}
              value={content.performerCount ?? ""}
              onChange={(event) => {
                const performerCount = parseCount(event.target.value, 40);
                if (performerCount !== null) set({ performerCount });
              }}
            />
          </Field>
          <Field id="rider-set-length" label="Set length (minutes)">
            <Input
              id="rider-set-length"
              type="number"
              inputMode="numeric"
              min={0}
              max={240}
              disabled={readOnly}
              value={content.setLengthMinutes ?? ""}
              onChange={(event) => {
                const setLengthMinutes = parseCount(event.target.value, 240);
                if (setLengthMinutes !== null) set({ setLengthMinutes });
              }}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircleIcon className="size-4 text-muted-foreground" aria-hidden />
            Day-of contact
          </CardTitle>
          <CardDescription>Who production should call on show day.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field id="rider-contact-name" label="Name" className="sm:col-span-2">
            <Input
              id="rider-contact-name"
              autoComplete="name"
              disabled={readOnly}
              value={content.contactName ?? ""}
              onChange={(event) => set({ contactName: event.target.value || undefined })}
            />
          </Field>
          <Field id="rider-contact-email" label="Email">
            <Input
              id="rider-contact-email"
              type="email"
              autoComplete="email"
              disabled={readOnly}
              value={content.contactEmail ?? ""}
              onChange={(event) => set({ contactEmail: event.target.value || undefined })}
            />
          </Field>
          <Field id="rider-contact-phone" label="Phone">
            <Input
              id="rider-contact-phone"
              type="tel"
              autoComplete="tel"
              disabled={readOnly}
              value={content.contactPhone ?? ""}
              onChange={(event) => set({ contactPhone: event.target.value || undefined })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <NotePencilIcon className="size-4 text-muted-foreground" aria-hidden />
            Notes
          </CardTitle>
          <CardDescription>Printed on the rider PDF.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          <Field id="rider-power-notes" label="Power">
            <Textarea
              id="rider-power-notes"
              rows={4}
              placeholder="e.g. Two 20A circuits stage left"
              disabled={readOnly}
              value={content.powerNotes ?? ""}
              onChange={(event) => set({ powerNotes: event.target.value || undefined })}
            />
          </Field>
          <Field id="rider-general-notes" label="General">
            <Textarea
              id="rider-general-notes"
              rows={4}
              disabled={readOnly}
              value={content.generalNotes ?? ""}
              onChange={(event) => set({ generalNotes: event.target.value || undefined })}
            />
          </Field>
          <Field id="rider-hospitality-notes" label="Hospitality">
            <Textarea
              id="rider-hospitality-notes"
              rows={4}
              placeholder="e.g. Water on stage, green room for five"
              disabled={readOnly}
              value={content.hospitalityNotes ?? ""}
              onChange={(event) => set({ hospitalityNotes: event.target.value || undefined })}
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}
